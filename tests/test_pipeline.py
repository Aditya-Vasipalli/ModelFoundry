"""
Pipeline tests. Run inside the backend image:

  docker compose run --rm --no-deps -v "$PWD:/app" api sh -c "pip install -q pytest && pytest -q"
"""

import numpy as np
import pandas as pd
import pytest

from model import ModelPipeline, clean_target, train_and_evaluate
from preprocessing import DataPreprocessor
from worker import read_dataset


def make_classification_df(n=300, seed=0):
    rng = np.random.default_rng(seed)
    age = rng.integers(18, 80, n).astype(object)
    age[rng.choice(n, 15, replace=False)] = '?'  # numeric column polluted with missing markers
    sex = rng.choice(['male', 'female'], n)
    port = rng.choice(['C', 'Q', 'S', None], n)
    fare = rng.gamma(2, 20, n)
    name = [f'Person {i}' for i in range(n)]  # high-cardinality text -> dropped
    survived = ((sex == 'female') | (fare > 60)).astype(int)
    return pd.DataFrame({
        'PassengerId': np.arange(1, n + 1), 'Name': name, 'Age': age, 'Sex': sex,
        'Embarked': port, 'Fare': fare, 'Survived': survived,
    })


def make_regression_df(n=300, seed=1):
    rng = np.random.default_rng(seed)
    area = rng.uniform(40, 250, n)
    rooms = rng.integers(1, 7, n)
    city = rng.choice(['north', 'south', 'east'], n)
    price = area * 3000 + rooms * 10000 + np.where(city == 'north', 50000, 0) + rng.normal(0, 5000, n)
    return pd.DataFrame({'area': area, 'rooms': rooms, 'city': city, 'price': price})


@pytest.mark.parametrize('model_type', ['logistic_regression', 'random_forest_classifier'])
def test_classification_end_to_end(tmp_path, model_type):
    df = make_classification_df()
    path, metrics, schema = train_and_evaluate(
        df.drop(columns=['Survived']), df['Survived'], model_type, 'clf', save_dir=tmp_path
    )
    names = {f['name']: f for f in schema}
    assert 'PassengerId' not in names and 'Name' not in names
    assert names['Age']['type'] == 'numeric' and names['Age']['integer'] is True
    assert names['Sex']['categories'] == ['female', 'male']
    assert metrics['accuracy'] > 0.8

    import joblib
    pipeline = joblib.load(path)
    result = pipeline.predict_one({'Age': 30, 'Sex': 'female', 'Embarked': 'S', 'Fare': 10.0})
    assert result['prediction'] in (0, 1) and isinstance(result['prediction'], int)
    assert 0.5 <= result['probability'] <= 1
    assert abs(sum(p['probability'] for p in result['probabilities']) - 1) < 1e-6


@pytest.mark.parametrize('model_type', ['linear_regression', 'random_forest_regressor'])
def test_regression_end_to_end(tmp_path, model_type):
    df = make_regression_df()
    path, metrics, schema = train_and_evaluate(
        df.drop(columns=['price']), df['price'], model_type, 'reg', save_dir=tmp_path
    )
    assert {'rmse', 'r2_score', 'mae'} <= metrics.keys()
    assert metrics['r2_score'] > 0.8

    import joblib
    result = joblib.load(path).predict_one({'area': 100, 'rooms': 3, 'city': 'north'})
    assert isinstance(result['prediction'], float) and 'probability' not in result


def test_inference_accepts_strings_and_missing_values():
    df = make_classification_df()
    pre = DataPreprocessor()
    pre.fit_transform(df.drop(columns=['Survived']), df['Survived'])
    out = pre.transform(pd.DataFrame([{'Age': '42', 'Sex': 'unknown', 'Fare': None}]))
    assert list(out.columns) == pre.keep_columns_
    assert not out.isna().any().any()


def test_numeric_looking_categories_match_json_numbers():
    rng = np.random.default_rng(3)
    grade = rng.choice(['1', '2', '3', 'x'], 200)  # mostly digits but not numeric -> categorical
    y = (grade == '3').astype(int)
    pre = DataPreprocessor()
    pre.fit_transform(pd.DataFrame({'grade': grade, 'noise': rng.normal(size=200)}), y)
    a = pre.transform(pd.DataFrame([{'grade': 3, 'noise': 0}]))
    b = pre.transform(pd.DataFrame([{'grade': '3', 'noise': 0}]))
    assert a.equals(b)


def test_models_pickled_by_older_versions_still_predict():
    df = make_classification_df()
    pre = DataPreprocessor()
    X, y = pre.fit_transform(df.drop(columns=['Survived']), df['Survived'])
    for attr in ('numeric_coerced_', 'dropped_id_like_', 'category_modes_', 'feature_stats_'):
        delattr(pre, attr)
    from sklearn.linear_model import LogisticRegression
    pipeline = ModelPipeline(pre, LogisticRegression().fit(X, y))
    assert pipeline.predict_one({'Age': 30, 'Sex': 'male', 'Fare': 5})['prediction'] in (0, 1)
    assert all('name' in f for f in pre.feature_schema())


def test_target_validation_messages():
    with pytest.raises(ValueError, match='regression'):
        clean_target(pd.Series(np.linspace(0, 1, 200), name='t'), True, 't')
    with pytest.raises(ValueError, match='classification'):
        clean_target(pd.Series(['a', 'b'] * 50, name='t'), False, 't')
    y, mask = clean_target(pd.Series([1.0, 0.0, '?', None] * 10, name='t'), True, 't')
    assert len(y) == 20 and mask.sum() == 20 and y.dtype == 'int64'


def test_read_dataset_detects_semicolons_and_bom(tmp_path):
    path = tmp_path / 'wine.csv'
    path.write_bytes('﻿fixed acidity;quality\n7.4;5\n7.8;6\n'.encode('utf-8'))
    df = read_dataset(str(path))
    assert list(df.columns) == ['fixed acidity', 'quality']
    assert df['quality'].tolist() == [5, 6]
