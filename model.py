import math
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from preprocessing import DataPreprocessor, replace_missing

MIN_ROWS = 10
MAX_CLASSES = 100

MODEL_FACTORIES = {
    'logistic_regression': lambda: LogisticRegression(max_iter=1000, random_state=42),
    'random_forest_classifier': lambda: RandomForestClassifier(random_state=42, n_jobs=-1),
    'linear_regression': lambda: LinearRegression(),
    'random_forest_regressor': lambda: RandomForestRegressor(random_state=42, n_jobs=-1),
}


def is_classification_model(model_type: str) -> bool:
    return 'classifier' in model_type or 'logistic' in model_type


def get_model(model_type):
    """
    Returns the appropriate scikit-learn model based on the string model_type.
    """
    if model_type not in MODEL_FACTORIES:
        raise ValueError(f"Unknown model_type: {model_type}. Must be one of {list(MODEL_FACTORIES)}")
    return MODEL_FACTORIES[model_type]()


def _to_python(value):
    return value.item() if isinstance(value, np.generic) else value


class ModelPipeline:
    def __init__(self, preprocessor, model):
        self.preprocessor = preprocessor
        self.model = model

    def predict(self, X):
        X_processed = self.preprocessor.transform(X)
        return self.model.predict(X_processed)

    def predict_one(self, features: dict) -> dict:
        """Predict a single row. Classifiers also return per-class probabilities."""
        X_processed = self.preprocessor.transform(pd.DataFrame([features]))
        result = {"prediction": _to_python(self.model.predict(X_processed)[0])}

        if hasattr(self.model, 'predict_proba'):
            proba = self.model.predict_proba(X_processed)[0]
            ranked = sorted(zip(self.model.classes_, proba), key=lambda pair: -pair[1])
            result["probability"] = float(ranked[0][1])
            result["probabilities"] = [
                {"label": _to_python(label), "probability": float(p)} for label, p in ranked
            ]
        return result


def clean_target(y: pd.Series, is_classification: bool, name: str):
    """
    Validates the target column for the chosen task.
    Returns (cleaned_target, mask_of_rows_to_keep).
    """
    y = replace_missing(y)
    mask = y.notna()

    if is_classification:
        values = y[mask]
        n_classes = values.nunique()
        if n_classes < 2:
            raise ValueError(f"Target column '{name}' needs at least two different values to train a classifier.")
        numeric = pd.to_numeric(values, errors='coerce')
        if numeric.notna().all():
            is_integer = bool(np.all(np.mod(numeric, 1) == 0))
            if not is_integer and n_classes > 20:
                raise ValueError(
                    f"Target column '{name}' looks continuous ({n_classes} distinct numbers). "
                    "Choose a regression model instead."
                )
            labels = numeric.astype('int64') if is_integer else numeric.astype(float)  # 1.0 -> 1
        else:
            labels = values.astype(str)
        if n_classes > MAX_CLASSES:
            raise ValueError(
                f"Target column '{name}' has {n_classes} distinct values — too many classes. "
                "Choose a regression model if it's a number, or a different target."
            )
    else:
        numeric = pd.to_numeric(y, errors='coerce')
        unparseable = (numeric.isna() & mask).sum()
        if unparseable > 0.05 * mask.sum():
            raise ValueError(
                f"Target column '{name}' isn't numeric, so it can't be used with a regression model. "
                "Choose a classification model instead."
            )
        mask &= numeric.notna()
        labels = numeric[mask].astype(float)

    if mask.sum() < MIN_ROWS:
        raise ValueError(f"Need at least {MIN_ROWS} rows with a value in '{name}' — found {int(mask.sum())}.")
    return labels.reset_index(drop=True), mask


def train_and_evaluate(df_X, y, model_type, model_id, save_dir='./temp_models'):
    """
    Trains a model pipeline and evaluates it.
    Saves the pipeline to a temporary .joblib file and returns the metrics.
    """
    # Create save directory if it doesn't exist
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)

    # Determine if classification or regression based on the model type
    is_classification = is_classification_model(model_type)
    model = get_model(model_type)

    y, mask = clean_target(pd.Series(y).reset_index(drop=True), is_classification, str(y.name))
    df_X = pd.DataFrame(df_X).reset_index(drop=True)[mask].reset_index(drop=True)

    # Split dataset (stratified when every class has enough rows to appear in both halves)
    stratify = None
    if is_classification and y.value_counts().min() >= 2 and math.ceil(0.2 * len(y)) >= y.nunique():
        stratify = y
    X_train, X_test, y_train, y_test = train_test_split(
        df_X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    # 1. Get Preprocessor
    preprocessor = DataPreprocessor(is_regression=not is_classification)

    # 2. Preprocess Training Data (this handles outlier removal which modifies y)
    X_train_processed, y_train_processed = preprocessor.fit_transform(X_train, y_train)

    # 3. Train
    model.fit(X_train_processed, y_train_processed.to_numpy())

    # 4. Predict and Evaluate on Test Data
    X_test_processed = preprocessor.transform(X_test)
    y_pred = model.predict(X_test_processed)
    y_true = y_test.to_numpy()

    metrics = {}
    if is_classification:
        metrics['accuracy'] = float(accuracy_score(y_true, y_pred))
        metrics['f1_score'] = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))
        metrics['precision'] = float(precision_score(y_true, y_pred, average='weighted', zero_division=0))
        metrics['recall'] = float(recall_score(y_true, y_pred, average='weighted', zero_division=0))
        metrics['n_classes'] = int(y.nunique())
    else:
        metrics['rmse'] = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        metrics['r2_score'] = float(r2_score(y_true, y_pred))
        metrics['mae'] = float(mean_absolute_error(y_true, y_pred))
    metrics['train_rows'] = int(len(X_train_processed))
    metrics['test_rows'] = int(len(X_test))

    # 5. Extract Feature Schema for Frontend
    features_schema = preprocessor.feature_schema()

    # 6. Save Pipeline
    pipeline = ModelPipeline(preprocessor, model)
    model_path = os.path.join(save_dir, f"{model_id}.joblib")
    joblib.dump(pipeline, model_path)

    return model_path, metrics, features_schema
