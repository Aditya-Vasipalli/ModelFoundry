export type ModelType =
  | 'logistic_regression'
  | 'random_forest_classifier'
  | 'linear_regression'
  | 'random_forest_regressor'

export type JobStatus = 'pending' | 'processing' | 'ready' | 'failed'

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
  train_rows?: number
  test_rows?: number
}

export interface RegressionMetrics {
  rmse: number
  r2_score: number
  mae?: number
  train_rows?: number
  test_rows?: number
}

export type Metrics = ClassificationMetrics | RegressionMetrics

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
  error_message: string | null
  features: FeatureSchema[] | null
  created_at: string
  updated_at: string
}

/** What the backend exposes about a model to anyone with its link */
export type PublicModel = Pick<
  TrainingJob,
  'id' | 'dataset_name' | 'target_column' | 'model_type' | 'metrics' | 'features' | 'created_at'
>

export interface PredictionResult {
  prediction: string | number | boolean
  probability?: number
  probabilities?: { label: string | number | boolean; probability: number }[]
}
