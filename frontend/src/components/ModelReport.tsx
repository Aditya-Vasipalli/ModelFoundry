import type { ModelReport as Report } from '@/types'
import { formatDuration } from '@/lib/models'
import { ConfusionMatrix, FeatureImportanceChart, PredictionScatter } from './charts'

const DROP_REASONS: Record<string, string> = {
  excluded: 'Excluded by you',
  id_like: 'Looks like an ID',
  high_cardinality: 'Too many distinct text values',
  low_signal: 'No relationship with the target',
  collinear: 'Duplicates another feature',
}

function Card({ title, subtitle, children, className = '' }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function ModelReport({ report, target }: { report: Report; target: string }) {
  const { dataset } = report
  const dropped = Object.entries(dataset.dropped).filter(([, cols]) => cols.length > 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {report.leaderboard && report.leaderboard.length > 0 && (
        <Card
          title="Model comparison"
          subtitle={`Auto mode tried ${report.leaderboard.length} algorithms with ${report.cv?.folds ?? 0}-fold cross-validation and kept the best (${report.cv?.metric ?? 'score'}).`}
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Algorithm</th>
                  <th className="py-2 pr-3 text-right font-medium">{report.cv?.metric ?? 'Score'}</th>
                  <th className="py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {report.leaderboard.map((entry, i) => (
                  <tr key={entry.model} className="border-b border-zinc-800/60 last:border-0">
                    <td className="py-2.5 pr-3 text-zinc-500">{i + 1}</td>
                    <td className="py-2.5 pr-3 font-sans text-zinc-200">
                      {entry.label}
                      {entry.model === report.model && (
                        <span className="ml-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-px font-sans text-[10px] font-medium text-emerald-300">
                          Selected
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-zinc-200">
                      {entry.score == null
                        ? <span className="font-sans text-xs text-zinc-500" title={entry.error}>failed</span>
                        : <>{entry.score.toFixed(3)} <span className="text-zinc-500">± {(entry.std ?? 0).toFixed(3)}</span></>}
                    </td>
                    <td className="py-2.5 text-right text-zinc-400">{formatDuration(entry.seconds ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report.feature_importance.length > 0 && (
        <Card
          title="What drives the prediction"
          subtitle="Share of the model’s total importance per input. Higher means the model relies on it more."
        >
          <FeatureImportanceChart items={report.feature_importance.slice(0, 10)} />
        </Card>
      )}

      {report.confusion_matrix && (
        <Card
          title="Where it gets confused"
          subtitle={`Test rows by actual and predicted ${target}.${report.confusion_matrix.truncated ? ' Showing the 10 most common classes.' : ''}`}
        >
          <ConfusionMatrix labels={report.confusion_matrix.labels} matrix={report.confusion_matrix.matrix} />
        </Card>
      )}

      {report.predictions_sample && report.predictions_sample.length > 1 && (
        <Card title="Predicted vs actual" subtitle={`How close predictions on held-out test rows are to the real ${target}.`}>
          <PredictionScatter points={report.predictions_sample} target={target} />
        </Card>
      )}

      <Card title="Training data" subtitle="How the dataset was used." className={report.leaderboard ? '' : 'lg:col-span-2'}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {[
            ['Rows', dataset.rows.toLocaleString('en-US')],
            ['Train / test', `${dataset.train_rows.toLocaleString('en-US')} / ${dataset.test_rows.toLocaleString('en-US')}`],
            ['Features used', `${dataset.features_used} of ${dataset.columns}`],
            ['Outliers removed', dataset.outlier_rows_removed.toLocaleString('en-US')],
            ['Cross-validation', report.cv ? `${report.cv.mean.toFixed(3)} ± ${report.cv.std.toFixed(3)}` : '—'],
            ['Training time', formatDuration(report.timings.total)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="mt-0.5 font-mono text-zinc-200 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {dropped.length > 0 && (
          <div className="mt-5 space-y-2.5 border-t border-zinc-800 pt-4">
            <p className="text-xs font-medium text-zinc-400">Columns left out</p>
            {dropped.map(([reason, cols]) => (
              <div key={reason} className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="shrink-0 text-xs text-zinc-500 sm:w-48">{DROP_REASONS[reason] ?? reason}</span>
                <span className="flex flex-wrap gap-1.5">
                  {cols.map((c) => (
                    <span key={c} className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-400">{c}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[11px] text-zinc-600">
          scikit-learn {report.versions.scikit_learn} · pandas {report.versions.pandas} · Python {report.versions.python}
        </p>
      </Card>
    </div>
  )
}
