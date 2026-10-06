import type { Metrics, ModelType } from '@/types'

export type Task = 'classification' | 'regression'

export const MODEL_TYPES: Record<ModelType, { label: string; task: Task; description: string }> = {
  random_forest_classifier: {
    label: 'Random Forest',
    task: 'classification',
    description: 'Strong default. Captures non-linear patterns and feature interactions.',
  },
  logistic_regression: {
    label: 'Logistic Regression',
    task: 'classification',
    description: 'Fast and interpretable. Best when classes separate roughly linearly.',
  },
  random_forest_regressor: {
    label: 'Random Forest',
    task: 'regression',
    description: 'Strong default. Handles non-linear relationships without tuning.',
  },
  linear_regression: {
    label: 'Linear Regression',
    task: 'regression',
    description: 'Simple baseline. Best when the target grows linearly with features.',
  },
}

export const isClassification = (type: ModelType) => MODEL_TYPES[type]?.task === 'classification'

export function modelLabel(type: ModelType) {
  const info = MODEL_TYPES[type]
  return info ? `${info.label} ${info.task === 'classification' ? 'classifier' : 'regressor'}` : type
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

export function displayName(datasetName: string) {
  return datasetName.replace(/\.csv$/i, '')
}
