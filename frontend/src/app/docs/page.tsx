import type { Metadata } from 'next'
import Link from 'next/link'
import { siteOrigin } from '@/lib/site'
import { Logo } from '@/components/ui'
import { ArrowRightIcon } from '@/components/icons'

export const metadata: Metadata = {
  title: 'API docs',
  description: 'Call ModelFoundry models over HTTP: endpoints, authentication, limits and errors.',
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
      {children}
    </pre>
  )
}

function Endpoint({ method, path, children }: { method: string; path: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-zinc-900 pt-8">
      <h3 className="flex flex-wrap items-center gap-2 font-mono text-sm text-zinc-100">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${method === 'GET' ? 'bg-sky-500/10 text-sky-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
          {method}
        </span>
        {path}
      </h3>
      {children}
    </section>
  )
}

const ERRORS: [string, string][] = [
  ['400', 'The body isn’t valid JSON, or a value can’t be used (e.g. text where a number is expected).'],
  ['401', 'The model is private and no valid API key was sent.'],
  ['404', 'No such model, it’s still training, or it’s private and the key belongs to someone else.'],
  ['413', 'The request body is larger than 2 MB.'],
  ['422', 'The body has the wrong shape, e.g. more than 1,000 batch rows.'],
  ['429', 'Rate limit exceeded. Wait for the number of seconds in the Retry-After header.'],
  ['503', 'The prediction server is offline or busy. Retry with backoff.'],
]

export default async function DocsPage() {
  const base = `${await siteOrigin()}/api/v1`

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-[#050506]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link href="/dashboard" className="btn btn-secondary btn-sm">Dashboard <ArrowRightIcon size={14} /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        <div>
          <p className="text-sm font-medium text-zinc-500">Reference</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Prediction API</h1>
          <p className="mt-4 leading-relaxed text-zinc-400">
            Every trained model gets an HTTPS endpoint. Send the model’s inputs as JSON and get a prediction back,
            for one row or up to 1,000 at a time. Find a model’s ID and ready-made snippets on its page in the dashboard.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">Base URL</h2>
          <Code>{base}</Code>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">Authentication</h2>
          <p className="text-sm leading-relaxed text-zinc-400">
            <span className="text-zinc-200">Public</span> models need no authentication.{' '}
            <span className="text-zinc-200">Private</span> models need one of the owner’s API keys, created under{' '}
            <Link href="/dashboard/settings" className="text-zinc-200 underline decoration-zinc-600 underline-offset-4">API keys</Link>.
            Send it in the <code className="kbd">X-API-Key</code> header (or as <code className="kbd">Authorization: Bearer mf_…</code>).
            Keep keys on your server — never ship them in browser or mobile code.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">Endpoints</h2>
          <p className="text-sm text-zinc-400">Inputs you leave out, or send as <code className="kbd">null</code>, are filled with typical values from the training data.</p>
        </section>

        <Endpoint method="POST" path="/models/{id}/predict">
          <p className="text-sm text-zinc-400">Predict one row. Classifiers also return per-class probabilities.</p>
          <Code>{`curl -X POST ${base}/models/MODEL_ID/predict \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: mf_..." \\
  -d '{"features": {"Pclass": 1, "Sex": "female", "Age": 29}}'`}</Code>
          <Code>{`{
  "prediction": 1,
  "probability": 0.99,
  "probabilities": [
    { "label": 1, "probability": 0.99 },
    { "label": 0, "probability": 0.01 }
  ]
}`}</Code>
        </Endpoint>

        <Endpoint method="POST" path="/models/{id}/predict/batch">
          <p className="text-sm text-zinc-400">Predict up to 1,000 rows in one request. Results come back in the same order.</p>
          <Code>{`curl -X POST ${base}/models/MODEL_ID/predict/batch \\
  -H "Content-Type: application/json" \\
  -d '{"rows": [{"Age": 22, "Sex": "male"}, {"Age": 38, "Sex": "female"}]}'`}</Code>
          <Code>{`{ "predictions": [ { "prediction": 0, "probability": 0.88 }, { "prediction": 1, "probability": 0.94 } ] }`}</Code>
        </Endpoint>

        <Endpoint method="GET" path="/models/{id}">
          <p className="text-sm text-zinc-400">
            The model’s name, algorithm, metrics, evaluation report and input schema — useful for building your own form.
          </p>
          <Code>{`{
  "id": "…", "dataset_name": "titanic", "target_column": "Survived",
  "model_type": "auto_classifier", "metrics": { "accuracy": 0.81, … },
  "features": [ { "name": "Sex", "type": "categorical", "categories": ["female", "male"] }, … ]
}`}</Code>
        </Endpoint>

        <section className="space-y-3 border-t border-zinc-900 pt-8">
          <h2 className="text-lg font-semibold text-zinc-100">Limits</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
            <li>60 requests per minute per IP without a key; 600 per minute per API key.</li>
            <li>A batch request counts as one request per 50 rows.</li>
            <li>Request bodies up to 2 MB; up to 500 inputs per row.</li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-zinc-900 pt-8">
          <h2 className="text-lg font-semibold text-zinc-100">Errors</h2>
          <p className="text-sm text-zinc-400">Errors return JSON like <code className="kbd">{'{"detail": "…"}'}</code> with one of these status codes:</p>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <tbody>
                {ERRORS.map(([code, meaning]) => (
                  <tr key={code} className="border-b border-zinc-800 last:border-0">
                    <td className="w-16 px-4 py-2.5 align-top font-mono text-zinc-200">{code}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
