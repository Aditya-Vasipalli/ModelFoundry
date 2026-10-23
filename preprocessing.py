"""
preprocessing.py — Stateful data preprocessor.

Order of operations (training):
  1. Replace missing markers (?, NA, null, ...) with NaN and convert mostly-numeric
     text columns (e.g. numbers with a few "?" in them) to real numbers
  2. Drop ID-like columns and high-cardinality categoricals; label-encode the rest
  3. Impute remaining NaN (median for numbers, most frequent value for categories)
  4. Remove outlier ROWS by Z-score on continuous columns (training only; skipped
     if it would throw away more than 10% of the data)
  5. Drop features with negligible correlation to the target
  6. Drop collinear features (pairwise |corr| > collinearity_threshold)
  7. MinMaxScaler
  8. Regression only: Yeo-Johnson PowerTransform for normality / homoscedasticity

At inference (transform only):
  Steps 1-3, 7-8 applied identically using fitted parameters, restricted to the
  columns selected at fit time.

Models pickled by older versions of this class lack some of the attributes added
since, so every attribute introduced later is read with getattr() + a default.
"""

import re
import warnings

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.preprocessing import LabelEncoder, MinMaxScaler, PowerTransformer

warnings.filterwarnings('ignore')

# All strings that should be treated as missing
MISSING_MARKERS = ['?', 'NA', 'NaN', 'nan', 'null', 'NULL',
                   'None', 'none', '', 'N/A', 'n/a', '#N/A', 'na']

# A text column is treated as numeric if at least this share of its values parse as numbers
NUMERIC_RATIO = 0.95
# Outlier removal is skipped if it would drop more than this share of the rows
MAX_OUTLIER_FRACTION = 0.10

ID_NAME_PATTERN = re.compile(r'(^|[_\s])id$|^id([_\s]|$)|^(index|row_?num(ber)?|unnamed)')


def is_categorical(series: pd.Series) -> bool:
    return not pd.api.types.is_numeric_dtype(series)


def replace_missing(values):
    """Strip whitespace from text and turn missing markers into NaN (works on a Series or DataFrame)."""
    if isinstance(values, pd.DataFrame):
        return values.apply(replace_missing)
    if is_categorical(values):
        values = values.map(lambda v: v.strip() if isinstance(v, str) else v)
    return values.replace(MISSING_MARKERS, np.nan)


def _to_python(value):
    return value.item() if isinstance(value, np.generic) else value


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
        max_categories: int = 20,
    ):
        self.corr_threshold = corr_threshold
        self.collinearity_threshold = collinearity_threshold
        self.outlier_z = outlier_z
        self.is_regression = is_regression
        self.max_categories = max_categories

        # Learned state (populated by fit_transform)
        self.label_encoders_: dict = {}
        self.impute_values_: dict = {}
        self.keep_columns_: list = []
        self.dropped_high_cardinality_: list = []
        self.numeric_coerced_: list = []
        self.dropped_id_like_: list = []
        self.category_modes_: dict = {}
        self.feature_stats_: dict = {}
        self.dropped_low_signal_: list = []
        self.dropped_collinear_: list = []
        self.outlier_rows_removed_: int = 0
        self.scaler_ = MinMaxScaler()
        self.power_transformer_ = PowerTransformer(method='yeo-johnson') if is_regression else None

    # ------------------------------------------------------------------
    # Step 1: Missing markers + numeric coercion
    # ------------------------------------------------------------------
    def _coerce_numeric(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        for col in df.columns:
            if pd.api.types.is_bool_dtype(df[col]):
                df[col] = df[col].astype(float)

        self.numeric_coerced_ = []
        for col in df.columns:
            if not is_categorical(df[col]):
                continue
            non_null = df[col].dropna()
            if len(non_null) and pd.to_numeric(non_null, errors='coerce').notna().mean() >= NUMERIC_RATIO:
                self.numeric_coerced_.append(col)
                df[col] = pd.to_numeric(df[col], errors='coerce')
        return df

    # ------------------------------------------------------------------
    # Step 2a: Drop row identifiers (PassengerId, Unnamed: 0, ...)
    # ------------------------------------------------------------------
    def _drop_id_like(self, df: pd.DataFrame) -> pd.DataFrame:
        self.dropped_id_like_ = []
        n = len(df)
        for col in df.columns:
            s = df[col]
            if is_categorical(s) or n < 20:
                continue
            non_null = s.dropna()
            if len(non_null) < 0.95 * n or non_null.nunique() != len(non_null):
                continue
            if not np.all(np.mod(non_null.to_numpy(dtype=float), 1) == 0):
                continue
            span = non_null.max() - non_null.min() + 1
            if ID_NAME_PATTERN.search(str(col).strip().lower()) or span <= 1.5 * len(non_null):
                self.dropped_id_like_.append(col)
        return df.drop(columns=self.dropped_id_like_)

    # ------------------------------------------------------------------
    # Step 2b: Encode categorical columns (drop high cardinality)
    # ------------------------------------------------------------------
    def _encode_categoricals(self, df: pd.DataFrame, fit: bool) -> pd.DataFrame:
        df = df.copy()
        if fit:
            self.label_encoders_ = {}
            self.dropped_high_cardinality_ = []
            self.category_modes_ = {}
            for col in [c for c in df.columns if is_categorical(df[c])]:
                values = df[col].dropna().astype(str)
                uniques = values.unique()
                if len(uniques) > self.max_categories or len(uniques) == 0:
                    self.dropped_high_cardinality_.append(col)
                    df = df.drop(columns=[col])
                    continue
                self.label_encoders_[col] = LabelEncoder().fit(uniques)
                self.category_modes_[col] = str(values.mode().iloc[0])
        else:
            dropped = getattr(self, 'dropped_high_cardinality_', [])
            df = df.drop(columns=[c for c in dropped if c in df.columns])

        for col, le in self.label_encoders_.items():
            if col not in df.columns:
                continue
            codes = {cls: i for i, cls in enumerate(le.classes_)}

            def encode(val, _codes=codes):
                if pd.isna(val):
                    return np.nan
                if isinstance(val, float) and val.is_integer() and str(val) not in _codes:
                    val = int(val)  # 1.0 from JSON should match the category "1"
                return _codes.get(str(val), -1)  # -1 = category unseen during training

            df[col] = df[col].map(encode).astype(float)
        return df

    # ------------------------------------------------------------------
    # Step 3: Impute NaN (all cols numeric by now)
    # ------------------------------------------------------------------
    def _impute(self, df: pd.DataFrame, fit: bool) -> pd.DataFrame:
        df = df.copy()
        if fit:
            self.impute_values_ = {}
            for col in df.columns:
                if col in self.label_encoders_:
                    mode = df[col].mode()
                    fill = mode.iloc[0] if len(mode) else np.nan
                else:
                    fill = df[col].median()
                # If column is entirely NaN, fallback to 0
                self.impute_values_[col] = 0.0 if pd.isna(fill) else float(fill)

        for col, val in self.impute_values_.items():
            if col in df.columns:
                df[col] = df[col].fillna(val)

        # Safety net: fill any remaining NaN with 0
        return df.fillna(0)

    # ------------------------------------------------------------------
    # Step 4: Remove outlier ROWS (training only, not applied at inference)
    # ------------------------------------------------------------------
    def _remove_outlier_rows(self, df: pd.DataFrame, y: pd.Series):
        self.outlier_rows_removed_ = 0
        continuous = [c for c in df.columns if c not in self.label_encoders_ and df[c].nunique() > 10]
        if not continuous:
            return df, y
        sub = df[continuous]
        std = sub.std().replace(0, np.nan)
        z_scores = ((sub - sub.mean()) / std).abs().fillna(0)
        mask = (z_scores < self.outlier_z).all(axis=1)
        if mask.mean() < 1 - MAX_OUTLIER_FRACTION:
            return df, y
        self.outlier_rows_removed_ = int((~mask).sum())
        return df[mask].reset_index(drop=True), y[mask].reset_index(drop=True)

    # ------------------------------------------------------------------
    # Step 5: Drop low-correlation features
    # ------------------------------------------------------------------
    def _target_signals(self, y: pd.Series) -> list:
        if self.is_regression:
            return [pd.to_numeric(y, errors='coerce').fillna(0).to_numpy(dtype=float)]
        # Classification: correlate against one indicator per class, so the
        # arbitrary order of class labels doesn't matter for multi-class targets.
        labels = y.astype(str)
        classes = labels.unique()
        if len(classes) <= 2:
            classes = classes[:1]
        return [(labels == c).to_numpy(dtype=float) for c in classes]

    def _drop_low_correlation(self, df: pd.DataFrame, y: pd.Series):
        signals = self._target_signals(y.reset_index(drop=True))
        keep = []
        for col in df.columns:
            x = df[col].to_numpy(dtype=float)
            if np.std(x) == 0:
                continue  # constant columns carry no information
            best = 0.0
            for signal in signals:
                with np.errstate(all='ignore'):
                    corr = np.corrcoef(x, signal)[0, 1]
                if not np.isnan(corr):
                    best = max(best, abs(corr))
            if best >= self.corr_threshold:
                keep.append(col)

        if not keep:
            keep = [df.columns[0]]  # Always keep at least one feature

        self.dropped_low_signal_ = [c for c in df.columns if c not in keep]
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

        self.dropped_collinear_ = [c for c in df.columns if c not in keep]
        return df[keep], keep

    # ------------------------------------------------------------------
    # Feature schema (drives the generated prediction form)
    # ------------------------------------------------------------------
    def _record_feature_stats(self, df: pd.DataFrame) -> None:
        self.feature_stats_ = {}
        for col in self.keep_columns_:
            if col in self.label_encoders_:
                self.feature_stats_[col] = {"default": self.category_modes_.get(col)}
                continue
            values = df[col].to_numpy(dtype=float)
            is_integer = bool(np.all(np.mod(values, 1) == 0))
            median = float(np.median(values))
            self.feature_stats_[col] = {
                "min": float(values.min()),
                "max": float(values.max()),
                "default": round(median) if is_integer else round(median, 4),
                "integer": is_integer,
            }

    def dropped_columns(self) -> dict:
        """Columns removed during fitting, grouped by reason (for the model report)."""
        return {
            "id_like": [str(c) for c in getattr(self, 'dropped_id_like_', [])],
            "high_cardinality": [str(c) for c in getattr(self, 'dropped_high_cardinality_', [])],
            "low_signal": [str(c) for c in getattr(self, 'dropped_low_signal_', [])],
            "collinear": [str(c) for c in getattr(self, 'dropped_collinear_', [])],
        }

    def feature_schema(self) -> list:
        stats = getattr(self, 'feature_stats_', {})
        schema = []
        for col in self.keep_columns_:
            extra = {k: _to_python(v) for k, v in stats.get(col, {}).items() if v is not None}
            if col in self.label_encoders_:
                schema.append({
                    "name": col,
                    "type": "categorical",
                    "categories": [str(c) for c in self.label_encoders_[col].classes_],
                    **extra,
                })
            else:
                schema.append({"name": col, "type": "numeric", **extra})
        return schema

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def fit_transform(self, X, y):
        """Full training pipeline including row removal. Returns (X_processed, y_processed)."""
        df = pd.DataFrame(X).copy().reset_index(drop=True)
        y = pd.Series(y).reset_index(drop=True)

        # 1. Replace missing markers, parse numeric-looking text
        df = replace_missing(df)
        df = self._coerce_numeric(df)

        # 2. Drop identifiers, encode categoricals (fit)
        df = self._drop_id_like(df)
        df = self._encode_categoricals(df, fit=True)
        if df.shape[1] == 0:
            raise ValueError(
                "No usable feature columns left after preprocessing. Text columns with more than "
                f"{self.max_categories} distinct values (names, IDs, free text) are dropped automatically."
            )

        # 3. Impute NaN (fit)
        df = self._impute(df, fit=True)

        # 4. Remove outlier rows (only during training)
        df, y = self._remove_outlier_rows(df, y)

        # 5. Drop low-correlation features
        df, keep = self._drop_low_correlation(df, y)

        # 6. Drop collinear features
        df, keep = self._drop_collinear(df)
        self.keep_columns_ = keep
        self._record_feature_stats(df)

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
        df = replace_missing(pd.DataFrame(X).copy())

        # 2. Encode categoricals (use fitted encoders)
        df = self._encode_categoricals(df, fit=False)

        # Keep only columns selected during training; everything else must be numeric
        for col in self.keep_columns_:
            if col not in df.columns:
                df[col] = np.nan
            elif col not in self.label_encoders_:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        df = df[self.keep_columns_]

        # 3. Impute NaN (use fitted values)
        df = self._impute(df, fit=False)

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
