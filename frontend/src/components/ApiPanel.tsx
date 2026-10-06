'use client'

import { useState } from 'react'
import type { FeatureSchema } from '@/types'
import CopyButton from './CopyButton'
import { CodeIcon } from './icons'

type Lang = 'curl' | 'javascript' | 'python'

function examplePayload(features: FeatureSchema[]) {
  const values: Record<string, string | number> = {}
  for (const f of features) {
    if (f.type === 'categorical') values[f.name] = String(f.default ?? f.categories?.[0] ?? '')
    else values[f.name] = typeof f.default === 'number' ? f.default : 0
  }
  return { features: values }
}

export default function ApiPanel({ endpoint, features, isClassification }: {
  endpoint: string
  features: FeatureSchema[]
  isClassification: boolean
}) {
  const [lang, setLang] = useState<Lang>('curl')
  const body = JSON.stringify(examplePayload(features), null, 2)
  const indented = (n: number) => body.split('\n').join('\n' + ' '.repeat(n))

  const snippets: Record<Lang, string> = {
    curl: `curl -X POST ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`,
    javascript: `const res = await fetch("${endpoint}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${indented(2)}),\n});\nconst { prediction${isClassification ? ', probability' : ''} } = await res.json();`,
    python: `import requests\n\nres = requests.post(\n    "${endpoint}",\n    json=${indented(4)},\n)\nprint(res.json())`,
  }
  const response = isClassification
    ? '{ "prediction": …, "probability": 0.93, "probabilities": [{ "label": …, "probability": 0.93 }, …] }'
    : '{ "prediction": 123.45 }'

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
            <CodeIcon className="text-zinc-400" /> REST API
          </h2>
          <p className="mt-1 text-sm text-zinc-400">Call this model from any app. No API key needed.</p>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 pl-3">
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">POST</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300 sm:text-[13px]" title={endpoint}>{endpoint}</code>
          <CopyButton value={endpoint} label="" className="btn btn-ghost btn-sm btn-icon w-8" />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5" role="tablist">
              {(['curl', 'javascript', 'python'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lang === l}
                  onClick={() => setLang(l)}
                  className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                    lang === l ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {l === 'curl' ? 'cURL' : l === 'javascript' ? 'JavaScript' : 'Python'}
                </button>
              ))}
            </div>
            <CopyButton value={snippets[lang]} className="btn btn-ghost btn-sm" />
          </div>
          <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
            {snippets[lang]}
          </pre>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">Response</p>
          <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-400">{response}</pre>
        </div>
      </div>
    </section>
  )
}
