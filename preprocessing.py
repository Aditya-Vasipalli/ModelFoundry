"""
preprocessing.py — Stateful data preprocessor.

Order of operations (training):
  1. Replace missing markers (?, NA, NaN, null, etc.) → np.nan
  2. Encode all categoricals with LabelEncoder (fitted)
  3. Impute remaining NaN → median per column (fitted)
  4. Remove outlier ROWS using Z-score (training only)
  5. Drop features with |corr(feature, y)| < corr_threshold
  6. Drop collinear features (pairwise corr > collinearity_threshold)
  7. MinMaxScaler (fitted)
  8. For regression: Yeo-Johnson PowerTransform for normality / homoscedasticity

At inference (transform only):
  Steps 1-3, 7-8 applied identically using fitted parameters.
  Row removal and feature selection use columns learned at fit time.
"""

import pandas as pd
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.preprocessing import MinMaxScaler, LabelEncoder, PowerTransformer
import warnings

warnings.filterwarnings('ignore')

# All strings that should be treated as missing
MISSING_MARKERS = ['?', 'NA', 'NaN', 'nan', 'null', 'NULL',
                   'None', 'none', '', 'N/A', 'n/a', '#N/A', 'na']


class DataPreprocessor(BaseEstimator, TransformerMixin):
    """
    A single stateful transformer implementing the full preprocessing pipeline.
    Designed to be saved with joblib alongside the model.
    """

    def __init__(
        self,
        corr_threshold: float = 0.01,
        collinearity_threshold: float = 0.85,
        outlier_z: float = 3.0,
        is_regression: bool = False,
    ):
        self.corr_threshold = corr_threshold
        self.collinearity_threshold = collinearity_threshold
        self.outlier_z = outlier_z
        self.is_regression = is_regression

        # Learned state (populated by fit_transform)
        self.label_encoders_: dict = {}
        self.impute_values_: dict = {}
        self.keep_columns_: list = []
        self.scaler_ = MinMaxScaler()
        self.power_transformer_ = PowerTransformer(method='yeo-johnson') if is_regression else None

    # ------------------------------------------------------------------
    # Step 1: Replace missing markers
    # ------------------------------------------------------------------
    def _replace_missing(self, df: pd.DataFrame) -> pd.DataFrame:
        return df.replace(MISSING_MARKERS, np.nan)

    # ------------------------------------------------------------------
    # Step 2: Encode all categorical columns
    # ------------------------------------------------------------------
    def _encode_categoricals(self, df: pd.DataFrame, fit: bool) -> pd.DataFrame:
        df = df.copy()
        cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()

        for col in cat_cols:
            if fit:
                le = LabelEncoder()
                # Fit only on non-null values cast to str
                non_null_vals = df[col].dropna().astype(str).unique()
                le.fit(non_null_vals)
                self.label_encoders_[col] = le

            le = self.label_encoders_.get(col)
            if le is None:
                # Unknown column at inference — drop it silently
                df[col] = 0
                continue

            def safe_encode(val, _le=le):
                if pd.isna(val):
                    return np.nan
                s = str(val)
                return int(_le.transform([s])[0]) if s in _le.classes_ else -1

            df[col] = df[col].apply(safe_encode)

        return df

    # ------------------------------------------------------------------
    # Step 3: Impute NaN with column medians (all cols numeric by now)
    # ------------------------------------------------------------------
    def _impute(self, df: pd.DataFrame, fit: bool) -> pd.DataFrame:
        df = df.copy()
        if fit:
            self.impute_values_ = {}
            for col in df.columns:
                median_val = df[col].median()
                # If column is entirely NaN, fallback to 0
                self.impute_values_[col] = 0 if pd.isna(median_val) else median_val

        for col, val in self.impute_values_.items():
            if col in df.columns:
                df[col] = df[col].fillna(val)

        # Safety net: fill any remaining NaN with 0
        df = df.fillna(0)
        return df

    # ------------------------------------------------------------------
    # Step 4: Remove outlier ROWS (training only, not applied at inference)
    # ------------------------------------------------------------------
    def _remove_outlier_rows(self, df: pd.DataFrame, y: pd.Series):
        std = df.std().replace(0, 1e-8)
        z_scores = ((df - df.mean()) / std).abs()
        mask = (z_scores < self.outlier_z).all(axis=1)
        return df[mask].reset_index(drop=True), y[mask].reset_index(drop=True)

    # ------------------------------------------------------------------
    # Step 5: Drop low-correlation features
    # ------------------------------------------------------------------
    def _drop_low_correlation(self, df: pd.DataFrame, y: pd.Series):
        y_num = y.copy().reset_index(drop=True)
        if not pd.api.types.is_numeric_dtype(y_num):
            y_num = pd.Series(pd.factorize(y_num)[0])

        keep = []
        for col in df.columns:
            try:
                corr = float(np.abs(np.corrcoef(df[col].reset_index(drop=True), y_num)[0, 1]))
                if np.isnan(corr):
                    corr = 0.0
            except Exception:
                corr = 0.0
            if corr >= self.corr_threshold:
                keep.append(col)

        if not keep:
            keep = [df.columns[0]]  # Always keep at least one feature

        return df[keep], keep

    # ------------------------------------------------------------------
    # Step 6: Drop collinear features (upper triangle of corr matrix)
    # ------------------------------------------------------------------
    def _drop_collinear(self, df: pd.DataFrame):
        corr_matrix = df.corr().abs()
        upper = corr_matrix.where(
            np.triu(np.ones(corr_matrix.shape, dtype=bool), k=1)
        )
        drop = {col for col in upper.columns if any(upper[col] > self.collinearity_threshold)}
        keep = [col for col in df.columns if col not in drop]

        if not keep:
            keep = [df.columns[0]]

        return df[keep], keep

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def fit_transform(self, X, y):
        """Full training pipeline including row removal. Returns (X_processed, y_processed)."""
        df = pd.DataFrame(X).copy()
        y = pd.Series(y).reset_index(drop=True)

        # 1. Replace missing markers
        df = self._replace_missing(df)

        # 2. Encode categoricals (fit)
        df = self._encode_categoricals(df, fit=True)

        # 3. Impute NaN (fit)
        df = self._impute(df, fit=True)

        # 4. Remove outlier rows (only during training)
        df, y = self._remove_outlier_rows(df, y)

        # 5. Drop low-correlation features
        df, keep = self._drop_low_correlation(df, y)

        # 6. Drop collinear features
        df, keep = self._drop_collinear(df)
        self.keep_columns_ = keep

        # 7. MinMax scale (fit)
        X_scaled = self.scaler_.fit_transform(df)
        df_scaled = pd.DataFrame(X_scaled, columns=self.keep_columns_)

        # 8. For regression: Yeo-Johnson to stabilise variance (homoscedasticity)
        if self.is_regression and self.power_transformer_ is not None:
            X_final = self.power_transformer_.fit_transform(df_scaled)
            df_scaled = pd.DataFrame(X_final, columns=self.keep_columns_)

        return df_scaled, y

    def transform(self, X):
        """Inference pipeline — no row removal."""
        df = pd.DataFrame(X).copy()

        # 1. Replace missing markers
        df = self._replace_missing(df)

        # 2. Encode categoricals (use fitted encoders)
        df = self._encode_categoricals(df, fit=False)

        # 3. Impute NaN (use fitted medians)
        df = self._impute(df, fit=False)

        # Keep only columns selected during training
        for col in self.keep_columns_:
            if col not in df.columns:
                df[col] = self.impute_values_.get(col, 0)
        df = df[self.keep_columns_]

        # 7. MinMax scale
        X_scaled = self.scaler_.transform(df)
        df_scaled = pd.DataFrame(X_scaled, columns=self.keep_columns_)

        # 8. Regression: Yeo-Johnson
        if self.is_regression and self.power_transformer_ is not None:
            X_final = self.power_transformer_.transform(df_scaled)
            df_scaled = pd.DataFrame(X_final, columns=self.keep_columns_)

        return df_scaled

    def fit(self, X, y=None):
        """Sklearn compatibility. Use fit_transform for actual fitting."""
        return self
