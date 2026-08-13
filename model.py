import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, f1_score, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline

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

class ModelPipeline:
    def __init__(self, preprocessor, model):
        self.preprocessor = preprocessor
        self.model = model
        
    def predict(self, X):
        X_processed = self.preprocessor.transform(X)
        return self.model.predict(X_processed)

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
    from preprocessing import DataPreprocessor
    preprocessor = DataPreprocessor(is_regression=not is_classification)

    # 2. Preprocess Training Data (this handles outlier removal which modifies y)
    X_train_processed, y_train_processed = preprocessor.fit_transform(X_train, y_train)

    # 3. Get Model and Train
    model = get_model(model_type)
    model.fit(X_train_processed, y_train_processed)

    # 4. Predict and Evaluate on Test Data
    X_test_processed = preprocessor.transform(X_test)
    y_pred = model.predict(X_test_processed)
    
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

    # 5. Extract Feature Schema for Frontend
    features_schema = []
    for col in preprocessor.keep_columns_:
        if col in preprocessor.label_encoders_:
            features_schema.append({
                "name": col,
                "type": "categorical",
                "categories": preprocessor.label_encoders_[col].classes_.tolist()
            })
        else:
            features_schema.append({
                "name": col,
                "type": "numeric"
            })

    # 6. Save Pipeline
    pipeline = ModelPipeline(preprocessor, model)
    model_path = os.path.join(save_dir, f"{model_id}.joblib")
    joblib.dump(pipeline, model_path)

    return model_path, metrics, features_schema
