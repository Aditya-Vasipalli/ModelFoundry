"""
Pipeline tests. Run inside the backend image:

  docker compose run --rm --no-deps -v "$PWD:/app" api sh -c "pip install -q -r requirements-dev.txt && pytest -q"
"""

import joblib
import numpy as np
import pandas as pd
import pytest

from model import AUTO_CANDIDATES, MODELS, ModelPipeline, clean_target, train_and_evaluate
from preprocessing import DataPreprocessor
from training import read_dataset

CLASSIFIERS = [name for name, spec in MODELS.items() if spec.task == 'classification']
REGRESSORS = [name for name, spec in MODELS.items() if spec.task == 'regression']


def make_classification_df(n=300, seed=0):
    rng = np.random.default_rng(seed)
    age = rng.integers(18, 80, n).astype(object)
    age[rng.choice(n, min(15, n // 5), replace=False)] = '?'  # numeric column polluted with missing markers
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


def train(df, target, model_type, tmp_path, **options):
    return train_and_evaluate(df.drop(columns=[target]), df[target], model_type, 'm', save_dir=tmp_path,
                              options=options)


@pytest.mark.parametrize('model_type', CLASSIFIERS)
def test_every_classifier_trains_and_predicts(tmp_path, model_type):
    path, metrics, schema, report = train(make_classification_df(), 'Survived', model_type, tmp_path)
    names = {f['name']: f for f in schema}
    assert 'PassengerId' not in names and 'Name' not in names
    assert metrics['accuracy'] > 0.7, model_type
    assert report['model'] == model_type and report['task'] == 'classification'
    assert report['confusion_matrix']['labels'] and report['feature_importance']

    pipeline = joblib.load(path)
    result = pipeline.predict_one({'Age': 30, 'Sex': 'female', 'Embarked': 'S', 'Fare': 10.0})
    assert result['prediction'] in (0, 1) and isinstance(result['prediction'], int)
    if 'probability' in result:
        assert abs(sum(p['probability'] for p in result['probabilities']) - 1) < 1e-6


@pytest.mark.parametrize('model_type', REGRESSORS)
def test_every_regressor_trains_and_predicts(tmp_path, model_type):
    path, metrics, schema, report = train(make_regression_df(), 'price', model_type, tmp_path)
    assert {'rmse', 'r2_score', 'mae'} <= metrics.keys()
    assert metrics['r2_score'] > 0.5, model_type
    assert len(report['predictions_sample']) == metrics['test_rows']

    result = joblib.load(path).predict_one({'area': 100, 'rooms': 3, 'city': 'north'})
    assert isinstance(result['prediction'], float) and 'probability' not in result


@pytest.mark.parametrize('model_type,df_factory,target', [
    ('auto_classifier', make_classification_df, 'Survived'),
    ('auto_regressor', make_regression_df, 'price'),
])
def test_auto_mode_ranks_candidates_and_keeps_the_best(tmp_path, model_type, df_factory, target):
    _, metrics, _, report = train(df_factory(), target, model_type, tmp_path)
    board = report['leaderboard']
    task = report['task']
    assert report['auto'] and {e['model'] for e in board} == set(AUTO_CANDIDATES[task])
    scores = [e['score'] for e in board if e['score'] is not None]
    assert scores == sorted(scores, reverse=True)
    assert report['model'] == board[0]['model']
    assert report['cv']['folds'] >= 2 and metrics['cv_score'] == pytest.approx(board[0]['score'])


def test_report_describes_dataset_and_dropped_columns(tmp_path):
    df = make_classification_df()
    df['constant'] = 1
    _, _, schema, report = train(df, 'Survived', 'random_forest_classifier', tmp_path, exclude_columns=['Embarked'])
    dropped = report['dataset']['dropped']
    assert dropped['excluded'] == ['Embarked'] and 'Embarked' not in {f['name'] for f in schema}
    assert 'PassengerId' in dropped['id_like'] and 'Name' in dropped['high_cardinality']
    assert 'constant' in dropped['low_signal']
    assert report['dataset']['target']['classes'] and report['versions']['scikit_learn']
    total = sum(f['importance'] for f in report['feature_importance'])
    assert 0.99 < total <= 1.0001


def test_test_size_option_controls_the_split(tmp_path):
    _, metrics, _, report = train(make_regression_df(n=200), 'price', 'ridge_regression', tmp_path, test_size=0.3)
    assert metrics['test_rows'] == 60 and report['test_size'] == 0.3


def test_slow_models_refuse_huge_datasets(tmp_path):
    df = make_regression_df(n=27000)  # 80% train split -> 21,600 rows, over 2x the SVM limit
    with pytest.raises(ValueError, match='too slow'):
        train(df, 'price', 'svm_regressor', tmp_path)


def test_predict_many_matches_predict_one(tmp_path):
    path, *_ = train(make_classification_df(), 'Survived', 'gradient_boosting_classifier', tmp_path)
    pipeline = joblib.load(path)
    rows = [{'Age': 30, 'Sex': 'female', 'Fare': 10}, {'Age': 50, 'Sex': 'male'}, {}]
    batch = pipeline.predict_many(rows)
    assert [b['prediction'] for b in batch] == [pipeline.predict_one(r)['prediction'] for r in rows]
    assert all(0.5 <= b['probability'] <= 1 for b in batch)


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
    for attr in ('numeric_coerced_', 'dropped_id_like_', 'category_modes_', 'feature_stats_',
                 'dropped_low_signal_', 'dropped_collinear_', 'outlier_rows_removed_'):
        delattr(pre, attr)
    from sklearn.linear_model import LogisticRegression
    pipeline = ModelPipeline(pre, LogisticRegression().fit(X, y))
    assert pipeline.predict_one({'Age': 30, 'Sex': 'male', 'Fare': 5})['prediction'] in (0, 1)
    assert len(pipeline.predict_many([{'Age': 30}, {'Fare': 3}])) == 2
    assert all('name' in f for f in pre.feature_schema())
    assert pre.dropped_columns()['low_signal'] == []


def test_target_validation_messages():
    with pytest.raises(ValueError, match='regression'):
        clean_target(pd.Series(np.linspace(0, 1, 200), name='t'), True, 't')
    with pytest.raises(ValueError, match='classification'):
        clean_target(pd.Series(['a', 'b'] * 50, name='t'), False, 't')
    y, mask = clean_target(pd.Series([1.0, 0.0, '?', None] * 10, name='t'), True, 't')
    assert len(y) == 20 and mask.sum() == 20 and y.dtype == 'int64'


def test_tiny_datasets_still_train(tmp_path):
    df = make_classification_df(n=12)
    _, metrics, _, report = train(df, 'Survived', 'auto_classifier', tmp_path)
    assert 'accuracy' in metrics and report['model']


def test_read_dataset_detects_semicolons_and_bom(tmp_path):
    path = tmp_path / 'wine.csv'
    path.write_bytes('﻿fixed acidity;quality\n7.4;5\n7.8;6\n'.encode('utf-8'))
    df = read_dataset(str(path))
    assert list(df.columns) == ['fixed acidity', 'quality']
    assert df['quality'].tolist() == [5, 6]
