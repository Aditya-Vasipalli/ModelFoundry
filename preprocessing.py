import pandas as pd
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, PowerTransformer, OneHotEncoder, OrdinalEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import warnings

# Suppress some common sklearn warnings during transformations
warnings.filterwarnings('ignore')


class TargetCorrelationSelector(BaseEstimator, TransformerMixin):
    """
    Drops numerical features that have a very low correlation with the target variable.
    """
    def __init__(self, threshold=0.01):
        self.threshold = threshold
        self.selected_features_ = None

    def fit(self, X, y):
        # We only apply this to numerical data. X is expected to be a numpy array or DataFrame.
        if isinstance(X, pd.DataFrame):
            df_X = X
        else:
            df_X = pd.DataFrame(X)
            
        correlations = []
        for col in df_X.columns:
            # Drop NaNs just for correlation calculation
            valid_idx = ~df_X[col].isna() & ~pd.isna(y)
            if valid_idx.sum() > 1:
                corr = np.abs(np.corrcoef(df_X[col][valid_idx], y[valid_idx])[0, 1])
                # Handle NaNs in correlation (e.g., zero variance)
                if np.isnan(corr):
                    corr = 0
            else:
                corr = 0
            correlations.append(corr)
            
        correlations = np.array(correlations)
        self.selected_features_ = (correlations >= self.threshold)
        
        # If all features are dropped, keep at least one with max correlation to avoid empty array errors
        if not np.any(self.selected_features_):
            self.selected_features_[np.argmax(correlations)] = True
            
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            return X.loc[:, self.selected_features_]
        return X[:, self.selected_features_]


class CollinearityDropper(BaseEstimator, TransformerMixin):
    """
    Drops features that are highly correlated with each other (multicollinearity).
    """
    def __init__(self, threshold=0.85):
        self.threshold = threshold
        self.drop_indices_ = []

    def fit(self, X, y=None):
        if isinstance(X, pd.DataFrame):
            df = X
        else:
            df = pd.DataFrame(X)

        corr_matrix = df.corr().abs()
        upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
        
        self.drop_indices_ = [i for i, column in enumerate(upper.columns) if any(upper[column] > self.threshold)]
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            return X.drop(X.columns[self.drop_indices_], axis=1)
        return np.delete(X, self.drop_indices_, axis=1)


class OutlierClipper(BaseEstimator, TransformerMixin):
    """
    Clips extreme outliers based on IQR. This is more robust than deleting rows 
    in a pipeline (as transformers shouldn't drop rows in sklearn).
    """
    def __init__(self, factor=3.0):
        self.factor = factor
        self.lower_bounds_ = None
        self.upper_bounds_ = None

    def fit(self, X, y=None):
        if isinstance(X, pd.DataFrame):
            df = X
        else:
            df = pd.DataFrame(X)
            
        Q1 = df.quantile(0.25)
        Q3 = df.quantile(0.75)
        IQR = Q3 - Q1
        
        self.lower_bounds_ = (Q1 - self.factor * IQR).values
        self.upper_bounds_ = (Q3 + self.factor * IQR).values
        return self

    def transform(self, X):
        X_copy = X.copy()
        if isinstance(X_copy, pd.DataFrame):
            X_copy = X_copy.values
            
        # Clip values
        for i in range(X_copy.shape[1]):
            X_copy[:, i] = np.clip(X_copy[:, i], self.lower_bounds_[i], self.upper_bounds_[i])
            
        if isinstance(X, pd.DataFrame):
            return pd.DataFrame(X_copy, columns=X.columns, index=X.index)
        return X_copy


def build_preprocessor(df_X, y=None):
    """
    Builds an automated sklearn pipeline based on the dataframe characteristics.
    """
    # Replace common missing value indicators with np.nan
    df_X = df_X.replace(['?', 'NA', 'NaN', 'null', ''], np.nan)
    
    # Identify column types
    numeric_cols = df_X.select_dtypes(include=['int64', 'float64']).columns.tolist()
    categorical_cols = df_X.select_dtypes(exclude=['int64', 'float64']).columns.tolist()

    # Separate categorical into low and high cardinality
    low_cardinality_cols = [col for col in categorical_cols if df_X[col].nunique() < 10]
    high_cardinality_cols = [col for col in categorical_cols if df_X[col].nunique() >= 10]

    # Numeric Pipeline
    numeric_pipeline_steps = [
        ('imputer', SimpleImputer(strategy='median')),
        ('outlier_clipper', OutlierClipper(factor=3.0)), # Clip extreme outliers
        ('collinearity', CollinearityDropper(threshold=0.85)) # Drop highly correlated features
    ]
    
    # If y is provided during build, we can add Target Correlation selection
    if y is not None:
        numeric_pipeline_steps.insert(2, ('target_corr', TargetCorrelationSelector(threshold=0.01)))
        
    numeric_pipeline_steps.extend([
        ('normality', PowerTransformer(method='yeo-johnson')), # Make data Gaussian
        ('scaler', StandardScaler())
    ])
    
    numeric_transformer = Pipeline(numeric_pipeline_steps)

    # Categorical Pipelines
    low_cardinality_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])
    
    high_cardinality_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('ordinal', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1))
    ])

    # Combine using ColumnTransformer
    transformers = []
    if numeric_cols:
        transformers.append(('num', numeric_transformer, numeric_cols))
    if low_cardinality_cols:
        transformers.append(('cat_low', low_cardinality_transformer, low_cardinality_cols))
    if high_cardinality_cols:
        transformers.append(('cat_high', high_cardinality_transformer, high_cardinality_cols))

    preprocessor = ColumnTransformer(transformers=transformers, remainder='drop')
    
    return preprocessor

def get_preprocessed_pipeline():
    # Helper to just get a generic pipeline skeleton if needed
    pass
