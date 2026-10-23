export type ModelType =
  | 'auto_classifier'
  | 'auto_regressor'
  | 'logistic_regression'
  | 'random_forest_classifier'
  | 'gradient_boosting_classifier'
  | 'extra_trees_classifier'
  | 'decision_tree_classifier'
  | 'knn_classifier'
  | 'svm_classifier'
  | 'naive_bayes_classifier'
  | 'linear_regression'
  | 'ridge_regression'
  | 'lasso_regression'
  | 'random_forest_regressor'
  | 'gradient_boosting_regressor'
  | 'extra_trees_regressor'
  | 'decision_tree_regressor'
  | 'knn_regressor'
  | 'svm_regressor'

export type JobStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'cancelled'

export interface FeatureSchema {
  name: string
  type: 'numeric' | 'categorical'
  categories?: string[]
  // Added by newer backends; older models don't have these
  default?: string | number
  min?: number
  max?: number
  integer?: boolean
}

export interface ClassificationMetrics {
  accuracy: number
  f1_score: number
  precision?: number
  recall?: number
  n_classes?: number
  cv_score?: number
  cv_std?: number
  train_rows?: number
  test_rows?: number
}

export interface RegressionMetrics {
  rmse: number
  r2_score: number
  mae?: number
  cv_score?: number
  cv_std?: number
  train_rows?: number
  test_rows?: number
}

export type Metrics = ClassificationMetrics | RegressionMetrics

export interface LeaderboardEntry {
  model: ModelType
  label: string
  score: number | null
  std?: number
  seconds?: number
  error?: string
}

export interface ModelReport {
  task: 'classification' | 'regression'
  model: ModelType
  model_label: string
  auto: boolean
  leaderboard: LeaderboardEntry[] | null
  cv: { metric: string; mean: number; std: number; folds: number } | null
  feature_importance: { feature: string; importance: number }[]
  confusion_matrix?: { labels: (string | number)[]; matrix: number[][]; truncated: boolean }
  predictions_sample?: [number, number][]
  dataset: {
    rows: number
    rows_used: number
    train_rows: number
    test_rows: number
    outlier_rows_removed: number
    columns: number
    features_used: number
    dropped: Record<'excluded' | 'id_like' | 'high_cardinality' | 'low_signal' | 'collinear', string[]>
    target: { name: string; classes?: Record<string, number>; n_classes?: number; min?: number; max?: number; mean?: number; median?: number }
  }
  test_size: number
  timings: { preprocessing: number; fit: number; total: number }
  versions: { scikit_learn: string; pandas: string; python: string }
}

export interface TrainingProgress {
  stage: 'queued' | 'loading' | 'preprocessing' | 'training' | 'evaluating' | 'saving' | 'done'
  message: string
  percent: number
}

export interface TrainingOptions {
  exclude_columns?: string[]
  test_size?: number
}

export interface TrainingJob {
  id: string
  user_id: string
  dataset_name: string
  dataset_path: string
  target_column: string
  model_type: ModelType
  status: JobStatus
  model_path: string | null
  metrics: Metrics | null
  report: ModelReport | null
  features: FeatureSchema[] | null
  options: TrainingOptions | null
  progress: TrainingProgress | null
  attempts: number
  is_public: boolean
  error_message: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
}

/** What the backend exposes about a model to anyone allowed to use it */
export type PublicModel = Pick<
  TrainingJob,
  'id' | 'dataset_name' | 'target_column' | 'model_type' | 'metrics' | 'features' | 'report' | 'is_public' | 'created_at'
>

export interface PredictionResult {
  prediction: string | number | boolean
  probability?: number
  probabilities?: { label: string | number | boolean; probability: number }[]
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export interface UsageDay {
  day: string
  predictions: number
  requests: number
  errors: number
  avg_latency_ms: number | null
}
