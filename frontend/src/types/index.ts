export type ModelType =
  | 'logistic_regression'
  | 'random_forest_classifier'
  | 'linear_regression'
  | 'random_forest_regressor'

export type JobStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface TrainingJob {
  id: string
  user_id: string
  dataset_name: string
  dataset_path: string
  target_column: string
  model_type: ModelType
  status: JobStatus
  model_path: string | null
  metrics: ClassificationMetrics | RegressionMetrics | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ClassificationMetrics {
  accuracy: number
  f1_score: number
}

export interface RegressionMetrics {
  rmse: number
  r2_score: number
}
