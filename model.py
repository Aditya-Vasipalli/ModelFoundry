import math
import os
import platform
import time
from typing import Callable, NamedTuple, Optional

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LassoCV, LinearRegression, LogisticRegression, RidgeCV
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_score, train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from preprocessing import DataPreprocessor, replace_missing

MIN_ROWS = 10
MAX_CLASSES = 100
# Model selection (cross-validation) uses at most this many training rows
CV_MAX_ROWS = 20000
TOP_FEATURES = 15


class ModelSpec(NamedTuple):
    label: str
    task: str  # "classification" | "regression"
    factory: Callable
    # Slow algorithms: skipped by Auto mode above this many training rows,
    # and refused outright above twice that.
    max_rows: Optional[int] = None


MODELS = {
    # Classification
    'logistic_regression': ModelSpec(
        'Logistic Regression', 'classification', lambda: LogisticRegression(max_iter=2000, random_state=42)),
    'random_forest_classifier': ModelSpec(
        'Random Forest', 'classification',
        lambda: RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42)),
    'gradient_boosting_classifier': ModelSpec(
        'Gradient Boosting', 'classification', lambda: HistGradientBoostingClassifier(random_state=42)),
    'extra_trees_classifier': ModelSpec(
        'Extra Trees', 'classification',
        lambda: ExtraTreesClassifier(n_estimators=200, n_jobs=-1, random_state=42)),
    'decision_tree_classifier': ModelSpec(
        'Decision Tree', 'classification', lambda: DecisionTreeClassifier(min_samples_leaf=5, random_state=42)),
    'knn_classifier': ModelSpec(
        'k-Nearest Neighbours', 'classification', lambda: KNeighborsClassifier(n_neighbors=7), max_rows=50000),
    'svm_classifier': ModelSpec(
        'Support Vector Machine', 'classification',
        # Calibrated so the SVM can report class probabilities
        lambda: CalibratedClassifierCV(SVC(random_state=42), cv=3, ensemble=False), max_rows=10000),
    'naive_bayes_classifier': ModelSpec('Naive Bayes', 'classification', lambda: GaussianNB()),
    # Regression
    'linear_regression': ModelSpec('Linear Regression', 'regression', lambda: LinearRegression()),
    'ridge_regression': ModelSpec(
        'Ridge Regression', 'regression', lambda: RidgeCV(alphas=np.logspace(-3, 3, 13))),
    'lasso_regression': ModelSpec(
        'Lasso Regression', 'regression', lambda: LassoCV(cv=3, max_iter=5000, random_state=42)),
    'random_forest_regressor': ModelSpec(
        'Random Forest', 'regression',
        lambda: RandomForestRegressor(n_estimators=200, n_jobs=-1, random_state=42)),
    'gradient_boosting_regressor': ModelSpec(
        'Gradient Boosting', 'regression', lambda: HistGradientBoostingRegressor(random_state=42)),
    'extra_trees_regressor': ModelSpec(
        'Extra Trees', 'regression', lambda: ExtraTreesRegressor(n_estimators=200, n_jobs=-1, random_state=42)),
    'decision_tree_regressor': ModelSpec(
        'Decision Tree', 'regression', lambda: DecisionTreeRegressor(min_samples_leaf=5, random_state=42)),
    'knn_regressor': ModelSpec(
        'k-Nearest Neighbours', 'regression', lambda: KNeighborsRegressor(n_neighbors=7), max_rows=50000),
    'svm_regressor': ModelSpec(
        'Support Vector Machine', 'regression',
        # SVR's epsilon/C assume a unit-scale target, so standardise it
        lambda: TransformedTargetRegressor(regressor=SVR(C=3.0), transformer=StandardScaler()), max_rows=10000),
}

# "Auto" tries every candidate with cross-validation and keeps the best one
AUTO_TYPES = {'auto_classifier': 'classification', 'auto_regressor': 'regression'}
AUTO_CANDIDATES = {
    'classification': [
        'gradient_boosting_classifier', 'random_forest_classifier', 'extra_trees_classifier',
        'logistic_regression', 'knn_classifier', 'svm_classifier', 'naive_bayes_classifier',
    ],
    'regression': [
        'gradient_boosting_regressor', 'random_forest_regressor', 'extra_trees_regressor',
        'ridge_regression', 'lasso_regression', 'knn_regressor', 'svm_regressor',
    ],
}
SCORING = {'classification': ('f1_weighted', 'F1 (weighted)'), 'regression': ('r2', 'R²')}

ALL_MODEL_TYPES = sorted([*MODELS, *AUTO_TYPES])


def task_of(model_type: str) -> str:
    if model_type in AUTO_TYPES:
        return AUTO_TYPES[model_type]
    if model_type in MODELS:
        return MODELS[model_type].task
    raise ValueError(f"Unknown model type: {model_type}")


def is_classification_model(model_type: str) -> bool:
    return task_of(model_type) == 'classification'


def get_model(model_type):
    """
    Returns a fresh, untrained scikit-learn estimator for model_type.
    """
    if model_type not in MODELS:
        raise ValueError(f"Unknown model_type: {model_type}. Must be one of {list(MODELS)}")
    return MODELS[model_type].factory()


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

    def predict_many(self, rows: list) -> list:
        """Vectorised prediction for many rows (missing fields are imputed)."""
        X_processed = self.preprocessor.transform(pd.DataFrame(rows))
        results = [{"prediction": _to_python(p)} for p in self.model.predict(X_processed)]
        if hasattr(self.model, 'predict_proba'):
            for result, proba in zip(results, self.model.predict_proba(X_processed)):
                result["probability"] = float(np.max(proba))
        return results


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


# ----------------------------------------------------------------------
# Evaluation helpers
# ----------------------------------------------------------------------
def _cross_validator(y: np.ndarray, is_classification: bool):
    """K-fold splitter sized to the data, or None when the data is too small to fold."""
    n_splits = 5 if len(y) <= 5000 else 3
    if is_classification:
        n_splits = min(n_splits, int(pd.Series(y).value_counts().min()))
        if n_splits < 2:
            return None
        return StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    n_splits = min(n_splits, len(y) // 2)
    return KFold(n_splits=n_splits, shuffle=True, random_state=42) if n_splits >= 2 else None


def _sample(X: pd.DataFrame, y: np.ndarray, limit: int):
    if len(X) <= limit:
        return X, y
    idx = np.random.default_rng(42).choice(len(X), size=limit, replace=False)
    return X.iloc[idx].reset_index(drop=True), y[idx]


def _feature_importance(model, X_test: pd.DataFrame, y_test: np.ndarray, scoring: str) -> list:
    names = [str(c) for c in X_test.columns]
    values = None
    if hasattr(model, 'feature_importances_'):
        values = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, 'coef_'):
        coef = np.asarray(model.coef_, dtype=float)
        values = np.abs(coef).mean(axis=0) if coef.ndim > 1 else np.abs(coef)

    if values is None or len(values) != len(names) or not np.all(np.isfinite(values)) or values.sum() <= 0:
        # Model-agnostic fallback: how much the test score drops when a column is shuffled
        n = min(len(X_test), 2000)
        if n < 2:
            return []
        result = permutation_importance(
            model, X_test.iloc[:n], y_test[:n], scoring=scoring, n_repeats=5, random_state=42)
        values = np.clip(result.importances_mean, 0, None)

    total = float(values.sum())
    if total <= 0:
        return []
    ranked = sorted(zip(names, values / total), key=lambda pair: -pair[1])[:TOP_FEATURES]
    return [{"feature": name, "importance": round(float(v), 4)} for name, v in ranked]


def _confusion(y_true: np.ndarray, y_pred: np.ndarray, top: int = 10) -> dict:
    counts = pd.Series(y_true).value_counts()
    labels = list(counts.index[:top])
    matrix = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "labels": [_to_python(label) for label in labels],
        "matrix": matrix.tolist(),
        "truncated": len(counts) > top,
    }


def _prediction_sample(y_true: np.ndarray, y_pred: np.ndarray, limit: int = 300) -> list:
    idx = np.arange(len(y_true))
    if len(idx) > limit:
        idx = np.random.default_rng(42).choice(idx, size=limit, replace=False)
    return [[round(float(y_true[i]), 6), round(float(y_pred[i]), 6)] for i in idx]


def _target_summary(y: pd.Series, is_classification: bool) -> dict:
    if is_classification:
        counts = y.value_counts()
        return {"classes": {str(k): int(v) for k, v in counts.head(10).items()}, "n_classes": int(len(counts))}
    return {
        "min": float(y.min()), "max": float(y.max()),
        "mean": float(y.mean()), "median": float(y.median()),
    }


def _noop_progress(stage: str, message: str, percent: int) -> None:
    pass


# ----------------------------------------------------------------------
# Training
# ----------------------------------------------------------------------
def train_and_evaluate(df_X, y, model_type, model_id, save_dir='./temp_models', options=None, progress=None):
    """
    Trains a model pipeline and evaluates it.
    Saves the pipeline to a .joblib file and returns (model_path, metrics, features_schema, report).
    """
    started = time.time()
    options = options or {}
    progress = progress or _noop_progress
    os.makedirs(save_dir, exist_ok=True)

    task = task_of(model_type)
    is_classification = task == 'classification'
    scoring, scoring_label = SCORING[task]

    # User options
    df_X = pd.DataFrame(df_X).reset_index(drop=True)
    excluded = [c for c in options.get('exclude_columns', []) if c in df_X.columns]
    df_X = df_X.drop(columns=excluded)
    if df_X.shape[1] == 0:
        raise ValueError("No feature columns left — don't exclude every column.")
    test_size = min(max(float(options.get('test_size', 0.2)), 0.1), 0.4)

    target_name = str(getattr(y, 'name', 'target'))
    rows_total = len(df_X)
    y, mask = clean_target(pd.Series(y).reset_index(drop=True), is_classification, target_name)
    df_X = df_X[mask].reset_index(drop=True)

    # Split dataset (stratified when every class has enough rows to appear in both halves)
    stratify = None
    if is_classification and y.value_counts().min() >= 2 and math.ceil(test_size * len(y)) >= y.nunique():
        stratify = y
    X_train, X_test, y_train, y_test = train_test_split(
        df_X, y, test_size=test_size, random_state=42, stratify=stratify
    )

    # Preprocess (outlier removal happens on the training split only)
    progress('preprocessing', 'Cleaning, encoding and selecting features', 15)
    preprocessor = DataPreprocessor(is_regression=not is_classification)
    X_train_p, y_train_p = preprocessor.fit_transform(X_train, y_train)
    y_train_arr = y_train_p.to_numpy()
    X_test_p = preprocessor.transform(X_test)
    y_test_arr = y_test.to_numpy()
    preprocessing_seconds = time.time() - started

    # Model selection / cross-validation
    X_cv, y_cv = _sample(X_train_p, y_train_arr, CV_MAX_ROWS)
    cv = _cross_validator(y_cv, is_classification)
    leaderboard = None

    def cross_validate(name):
        t = time.time()
        scores = cross_val_score(get_model(name), X_cv, y_cv, cv=cv, scoring=scoring, error_score='raise')
        return float(np.mean(scores)), float(np.std(scores)), time.time() - t

    if model_type in AUTO_TYPES:
        candidates = [
            name for name in AUTO_CANDIDATES[task]
            if MODELS[name].max_rows is None or len(X_train_p) <= MODELS[name].max_rows
        ]
        leaderboard = []
        for i, name in enumerate(candidates):
            progress('training', f'Trying {MODELS[name].label} ({i + 1} of {len(candidates)})',
                     20 + int(60 * i / len(candidates)))
            entry = {"model": name, "label": MODELS[name].label}
            try:
                if cv is not None:
                    entry["score"], entry["std"], entry["seconds"] = cross_validate(name)
                else:  # too little data to fold: rank on the held-out split instead
                    t = time.time()
                    m = get_model(name).fit(X_train_p, y_train_arr)
                    pred = m.predict(X_test_p)
                    entry["score"] = float(
                        f1_score(y_test_arr, pred, average='weighted', zero_division=0)
                        if is_classification else r2_score(y_test_arr, pred))
                    entry["std"], entry["seconds"] = 0.0, time.time() - t
                if not np.isfinite(entry["score"]):
                    raise ValueError("score is not a number")
            except Exception as e:
                entry = {"model": name, "label": MODELS[name].label, "score": None, "error": str(e)[:200]}
            entry["seconds"] = round(entry.get("seconds", 0.0), 2)
            leaderboard.append(entry)

        scored = [e for e in leaderboard if e.get("score") is not None]
        if not scored:
            raise ValueError("None of the candidate models could be trained on this data.")
        leaderboard.sort(key=lambda e: (e.get("score") is None, -(e.get("score") or 0)))
        best = leaderboard[0]["model"]
        cv_result = {"metric": scoring_label, "mean": leaderboard[0]["score"],
                     "std": leaderboard[0]["std"], "folds": cv.get_n_splits() if cv else 0}
    else:
        best = model_type
        limit = MODELS[best].max_rows
        if limit and len(X_train_p) > 2 * limit:
            raise ValueError(
                f"{MODELS[best].label} is too slow for {len(X_train_p):,} training rows. "
                "Pick Gradient Boosting or Random Forest, or use Auto."
            )
        cv_result = None
        if cv is not None:
            progress('training', f'Cross-validating {MODELS[best].label}', 30)
            mean, std, _ = cross_validate(best)
            cv_result = {"metric": scoring_label, "mean": mean, "std": std, "folds": cv.get_n_splits()}

    # Final fit on the whole training split
    progress('training', f'Training {MODELS[best].label} on {len(X_train_p):,} rows', 80)
    t = time.time()
    model = get_model(best)
    model.fit(X_train_p, y_train_arr)
    fit_seconds = time.time() - t

    # Evaluate on held-out test data
    progress('evaluating', 'Scoring the model on held-out test data', 90)
    y_pred = model.predict(X_test_p)

    metrics = {}
    if is_classification:
        metrics['accuracy'] = float(accuracy_score(y_test_arr, y_pred))
        metrics['f1_score'] = float(f1_score(y_test_arr, y_pred, average='weighted', zero_division=0))
        metrics['precision'] = float(precision_score(y_test_arr, y_pred, average='weighted', zero_division=0))
        metrics['recall'] = float(recall_score(y_test_arr, y_pred, average='weighted', zero_division=0))
        metrics['n_classes'] = int(y.nunique())
    else:
        metrics['rmse'] = float(np.sqrt(mean_squared_error(y_test_arr, y_pred)))
        metrics['r2_score'] = float(r2_score(y_test_arr, y_pred))
        metrics['mae'] = float(mean_absolute_error(y_test_arr, y_pred))
    if cv_result:
        metrics['cv_score'] = cv_result['mean']
        metrics['cv_std'] = cv_result['std']
    metrics['train_rows'] = int(len(X_train_p))
    metrics['test_rows'] = int(len(X_test))

    report = {
        "task": task,
        "model": best,
        "model_label": MODELS[best].label,
        "auto": model_type in AUTO_TYPES,
        "leaderboard": leaderboard,
        "cv": cv_result,
        "feature_importance": _feature_importance(model, X_test_p, y_test_arr, scoring),
        "dataset": {
            "rows": int(rows_total),
            "rows_used": int(len(y)),
            "train_rows": int(len(X_train_p)),
            "test_rows": int(len(X_test)),
            "outlier_rows_removed": int(getattr(preprocessor, 'outlier_rows_removed_', 0)),
            "columns": int(df_X.shape[1] + len(excluded)),
            "features_used": len(preprocessor.keep_columns_),
            "dropped": {"excluded": [str(c) for c in excluded], **preprocessor.dropped_columns()},
            "target": {"name": target_name, **_target_summary(y, is_classification)},
        },
        "test_size": test_size,
        "timings": {
            "preprocessing": round(preprocessing_seconds, 2),
            "fit": round(fit_seconds, 2),
            "total": round(time.time() - started, 2),
        },
        "versions": {
            "scikit_learn": sklearn.__version__,
            "pandas": pd.__version__,
            "python": platform.python_version(),
        },
    }
    if is_classification:
        report["confusion_matrix"] = _confusion(y_test_arr, y_pred)
    else:
        report["predictions_sample"] = _prediction_sample(y_test_arr, y_pred)

    # Extract Feature Schema for Frontend, then save pipeline
    progress('saving', 'Saving the trained model', 97)
    features_schema = preprocessor.feature_schema()
    pipeline = ModelPipeline(preprocessor, model)
    model_path = os.path.join(save_dir, f"{model_id}.joblib")
    joblib.dump(pipeline, model_path, compress=3)

    return model_path, metrics, features_schema, report
