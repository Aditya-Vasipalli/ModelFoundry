import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackendOfflineError, getPublicModel } from '@/lib/backend'
import { sessionToken } from '@/lib/proxy-request'
import { displayName, isClassification, jobModelLabel, modelLabel } from '@/lib/models'
import type { PublicModel } from '@/types'
import { Logo, MetricGrid, StatusBadge } from '@/components/ui'
import { ArrowRightIcon, LockIcon, ServerIcon } from '@/components/icons'
import PredictionForm from '@/components/PredictionForm'
import { FeatureImportanceChart } from '@/components/charts'

type Props = { params: Promise<{ id: string }> }

// Anonymous visitors can't read training_jobs (row-level security), so the
// shared page gets the model's public details from the backend instead. The
// viewer's session (if any) is passed along so owners can open private models.
async function loadModel(id: string): Promise<{ model: PublicModel | null; offline: boolean }> {
  try {
    return { model: await getPublicModel(id, await sessionToken()), offline: false }
  } catch (e) {
    if (e instanceof BackendOfflineError) return { model: null, offline: true }
    throw e
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await loadModel((await params).id)
  if (!model) return { title: 'Shared model' }
  const title = `${displayName(model.dataset_name)} predictor`
  const description = `Predict ${model.target_column} with a ${modelLabel(model.model_type).toLowerCase()} trained on ModelFoundry.`
  return { title, description, openGraph: { title, description } }
}

export default async function PublicModelPage({ params }: Props) {
  const { id } = await params
  const { model, offline } = await loadModel(id)
  if (!model && !offline) notFound()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-[#050506]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link href="/login" className="btn btn-secondary btn-sm">
            Build your own <ArrowRightIcon size={14} />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {model ? (
          <div className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                  {displayName(model.dataset_name)}
                </h1>
                <StatusBadge status="ready" label="Live" />
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {jobModelLabel(model)} that predicts <span className="text-zinc-200">{model.target_column}</span>
              </p>
            </div>
            {model.is_public === false && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
                <LockIcon size={14} className="mt-0.5 shrink-0" />
                This model is private, so only you can see this page. Make it public in the model’s settings to share the link.
              </p>
            )}
            <MetricGrid type={model.model_type} metrics={model.metrics} />
            <PredictionForm
              modelId={model.id}
              isClassification={isClassification(model.model_type)}
              features={model.features}
              targetColumn={model.target_column}
              backendOnline
              source="share"
            />
            {model.report?.feature_importance && model.report.feature_importance.length > 0 && (
              <section className="card p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-zinc-100">What drives the prediction</h2>
                <p className="mt-1 text-xs text-zinc-500">How much the model relies on each input.</p>
                <div className="mt-4">
                  <FeatureImportanceChart items={model.report.feature_importance.slice(0, 8)} />
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="card mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
            <span className="mb-5 flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400">
              <ServerIcon size={20} />
            </span>
            <h1 className="text-lg font-semibold text-zinc-100">This model is offline</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Its prediction server isn&apos;t running right now. Check back in a little while.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        Trained and served with{' '}
        <Link href="/" className="text-zinc-400 hover:text-zinc-200">ModelFoundry</Link>
      </footer>
    </div>
  )
}
