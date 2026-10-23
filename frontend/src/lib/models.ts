import type { Metrics, ModelType, TrainingJob } from '@/types'

export type Task = 'classification' | 'regression'
export type Speed = 'fast' | 'medium' | 'slow'

interface ModelInfo {
  label: string
  task: Task
  description: string
  speed: Speed
  auto?: boolean
}

// Keep in sync with MODELS in model.py
export const MODEL_TYPES: Record<ModelType, ModelInfo> = {
  auto_classifier: {
    label: 'Auto', task: 'classification', speed: 'slow', auto: true,
    description: 'Tries 7 algorithms with cross-validation and keeps the best one.',
  },
  gradient_boosting_classifier: {
    label: 'Gradient Boosting', task: 'classification', speed: 'medium',
    description: 'Usually the most accurate on tabular data. Handles missing values well.',
  },
  random_forest_classifier: {
    label: 'Random Forest', task: 'classification', speed: 'medium',
    description: 'Robust default. Captures non-linear patterns and feature interactions.',
  },
  extra_trees_classifier: {
    label: 'Extra Trees', task: 'classification', speed: 'medium',
    description: 'Like Random Forest with more randomness: fast and resistant to overfitting.',
  },
  logistic_regression: {
    label: 'Logistic Regression', task: 'classification', speed: 'fast',
    description: 'Fast and interpretable. Best when classes separate roughly linearly.',
  },
  decision_tree_classifier: {
    label: 'Decision Tree', task: 'classification', speed: 'fast',
    description: 'A single tree of if/else rules: easy to explain, less accurate.',
  },
  knn_classifier: {
    label: 'k-Nearest Neighbours', task: 'classification', speed: 'medium',
    description: 'Predicts from the most similar training rows. Good for small datasets.',
  },
  svm_classifier: {
    label: 'Support Vector Machine', task: 'classification', speed: 'slow',
    description: 'Strong on small, clean datasets. Slow above ~10k rows.',
  },
  naive_bayes_classifier: {
    label: 'Naive Bayes', task: 'classification', speed: 'fast',
    description: 'Very fast probabilistic baseline. Assumes features are independent.',
  },
  auto_regressor: {
    label: 'Auto', task: 'regression', speed: 'slow', auto: true,
    description: 'Tries 7 algorithms with cross-validation and keeps the best one.',
  },
  gradient_boosting_regressor: {
    label: 'Gradient Boosting', task: 'regression', speed: 'medium',
    description: 'Usually the most accurate on tabular data. Handles missing values well.',
  },
  random_forest_regressor: {
    label: 'Random Forest', task: 'regression', speed: 'medium',
    description: 'Robust default. Handles non-linear relationships without tuning.',
  },
  extra_trees_regressor: {
    label: 'Extra Trees', task: 'regression', speed: 'medium',
    description: 'Like Random Forest with more randomness: fast and resistant to overfitting.',
  },
  ridge_regression: {
    label: 'Ridge Regression', task: 'regression', speed: 'fast',
    description: 'Linear model with regularisation; stable when features are correlated.',
  },
  lasso_regression: {
    label: 'Lasso Regression', task: 'regression', speed: 'fast',
    description: 'Linear model that drops unhelpful features automatically.',
  },
  linear_regression: {
    label: 'Linear Regression', task: 'regression', speed: 'fast',
    description: 'Simple baseline. Best when the target grows linearly with features.',
  },
  decision_tree_regressor: {
    label: 'Decision Tree', task: 'regression', speed: 'fast',
    description: 'A single tree of if/else rules: easy to explain, less accurate.',
  },
  knn_regressor: {
    label: 'k-Nearest Neighbours', task: 'regression', speed: 'medium',
    description: 'Averages the most similar training rows. Good for small datasets.',
  },
  svm_regressor: {
    label: 'Support Vector Machine', task: 'regression', speed: 'slow',
    description: 'Strong on small, clean datasets. Slow above ~10k rows.',
  },
}

export const AUTO_MODEL: Record<Task, ModelType> = {
  classification: 'auto_classifier',
  regression: 'auto_regressor',
}

export const isClassification = (type: ModelType) => MODEL_TYPES[type]?.task === 'classification'

export function modelLabel(type: ModelType) {
  const info = MODEL_TYPES[type]
  if (!info) return type
  if (info.auto) return `Auto ${info.task === 'classification' ? 'classifier' : 'regressor'}`
  return `${info.label} ${info.task === 'classification' ? 'classifier' : 'regressor'}`
}

/** "Auto → Gradient Boosting" once an Auto job has picked its winner */
export function jobModelLabel(job: Pick<TrainingJob, 'model_type' | 'report'>) {
  if (MODEL_TYPES[job.model_type]?.auto && job.report?.model_label) {
    return `Auto → ${job.report.model_label}`
  }
  return modelLabel(job.model_type)
}

export interface MetricItem {
  key: string
  label: string
  value: string
  hint: string
  tone?: 'good' | 'neutral'
}

const percent = (v: number) => `${(v * 100).toFixed(1)}%`
const number = (v: number) =>
  Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Number(v.toPrecision(4)).toString()

export function metricItems(type: ModelType, metrics: Metrics | null): MetricItem[] {
  if (!metrics) return []
  const m = metrics as unknown as Record<string, number | undefined>
  const items: MetricItem[] = []
  const add = (key: string, label: string, format: (v: number) => string, hint: string, tone?: MetricItem['tone']) => {
    if (typeof m[key] === 'number') items.push({ key, label, value: format(m[key]!), hint, tone })
  }

  if (isClassification(type)) {
    add('accuracy', 'Accuracy', percent, 'Share of test rows predicted correctly', 'good')
    add('f1_score', 'F1 score', percent, 'Balance of precision and recall (weighted)', 'good')
    add('precision', 'Precision', percent, 'How often a predicted class is right')
    add('recall', 'Recall', percent, 'How many of each class the model finds')
  } else {
    add('r2_score', 'R²', (v) => v.toFixed(3), 'Variance explained — 1.0 is perfect', 'good')
    add('rmse', 'RMSE', number, 'Typical prediction error, in target units')
    add('mae', 'MAE', number, 'Average absolute error, in target units')
  }
  return items
}

/** Cross-validated score, e.g. "0.812 ± 0.021" */
export function cvSummary(metrics: Metrics | null) {
  const m = metrics as { cv_score?: number; cv_std?: number } | null
  if (typeof m?.cv_score !== 'number') return null
  return `${m.cv_score.toFixed(3)} ± ${(m.cv_std ?? 0).toFixed(3)}`
}

export function formatRelative(date: string) {
  // Clamp to the past: a machine with a slow clock would otherwise show "in 5 hours"
  const seconds = Math.min(0, (new Date(date).getTime() - Date.now()) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ]
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function formatDuration(seconds: number) {
  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

export function displayName(datasetName: string) {
  return datasetName.replace(/\.csv$/i, '')
}
