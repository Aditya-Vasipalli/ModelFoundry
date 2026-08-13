import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, f1_score, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from preprocessing import build_preprocessor

def get_model(model_type):
    """
    Returns the appropriate scikit-learn model based on the string model_type.
    """
    models = {
        'logistic_regression': LogisticRegression(max_iter=1000, random_state=42),
        'random_forest_classifier': RandomForestClassifier(random_state=42),
        'linear_regression': LinearRegression(),
        'random_forest_regressor': RandomForestRegressor(random_state=42)
    }
    
    if model_type not in models:
        raise ValueError(f"Unknown model_type: {model_type}. Must be one of {list(models.keys())}")
        
    return models[model_type]

def train_and_evaluate(df_X, y, model_type, model_id, save_dir='./temp_models'):
    """
    Trains a model pipeline and evaluates it.
    Saves the pipeline to a temporary .joblib file and returns the metrics.
    """
    # Create save directory if it doesn't exist
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
        
    # Determine if classification or regression based on the model type
    is_classification = 'classifier' in model_type or 'logistic' in model_type

    # Split dataset
    X_train, X_test, y_train, y_test = train_test_split(df_X, y, test_size=0.2, random_state=42)

    # 1. Get Preprocessor
    preprocessor = build_preprocessor(X_train, y_train)

    # 2. Get Model
    model = get_model(model_type)

    # 3. Create Pipeline
    pipeline = Pipeline([
        ('preprocessor', preprocessor),
        ('model', model)
    ])

    # 4. Train
    pipeline.fit(X_train, y_train)

    # 5. Predict and Evaluate
    y_pred = pipeline.predict(X_test)
    
    metrics = {}
    if is_classification:
        metrics['accuracy'] = float(accuracy_score(y_test, y_pred))
        # Handle cases where there might be multi-class or binary
        try:
            metrics['f1_score'] = float(f1_score(y_test, y_pred, average='weighted'))
        except ValueError:
            metrics['f1_score'] = 0.0
    else:
        metrics['rmse'] = float(mean_squared_error(y_test, y_pred, squared=False))
        metrics['r2_score'] = float(r2_score(y_test, y_pred))

    # 6. Save Pipeline
    model_path = os.path.join(save_dir, f"{model_id}.joblib")
    joblib.dump(pipeline, model_path)

    return model_path, metrics
