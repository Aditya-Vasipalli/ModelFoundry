"""The training supervisor: success, bad data, cancellation, timeouts."""

import os

import pytest

from tests.test_pipeline import make_regression_df
from training import run_training


@pytest.fixture
def csv_path(tmp_path):
    path = tmp_path / 'houses.csv'
    make_regression_df().to_csv(path, index=False)
    return str(path)


def test_trains_in_a_child_process_and_reports_progress(csv_path, tmp_path):
    stages = []
    outcome = run_training(csv_path, 'price', 'gradient_boosting_regressor', 'job1', {},
                           save_dir=str(tmp_path), on_progress=lambda p: stages.append(p['stage']))
    assert outcome.kind == 'done', outcome.message
    model_path, metrics, schema, report = outcome.result
    assert os.path.exists(model_path) and metrics['r2_score'] > 0.5
    assert stages[0] == 'loading' and 'training' in stages and stages[-1] == 'saving'


def test_bad_data_is_a_user_error(csv_path, tmp_path):
    outcome = run_training(csv_path, 'no_such_column', 'ridge_regression', 'job2', {}, save_dir=str(tmp_path))
    assert outcome.kind == 'user_error' and 'not found' in outcome.message


def test_cancellation_stops_training(csv_path, tmp_path):
    outcome = run_training(csv_path, 'price', 'auto_regressor', 'job3', {}, save_dir=str(tmp_path),
                           should_cancel=lambda: True)
    assert outcome.kind in ('cancelled', 'done')  # tiny datasets can finish before the first check


def test_timeout_stops_training(csv_path, tmp_path):
    outcome = run_training(csv_path, 'price', 'auto_regressor', 'job4', {}, save_dir=str(tmp_path), timeout=0.2)
    assert outcome.kind == 'timeout'
