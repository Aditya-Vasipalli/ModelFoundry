'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { FeatureSchema } from '@/types'
import CopyButton from './CopyButton'
import { CodeIcon, LockIcon } from './icons'

type Lang = 'curl' | 'javascript' | 'python'

const ENDPOINTS = [
  { path: '/predict', label: 'One row', hint: '{"features": {...}}' },
  { path: '/predict/batch', label: 'Batch', hint: 'up to 1,000 rows' },
]

function examplePayload(features: FeatureSchema[]) {
  const values: Record<string, string | number> = {}
  for (const f of features) {
    if (f.type === 'categorical') values[f.name] = String(f.default ?? f.categories?.[0] ?? '')
    else values[f.name] = typeof f.default === 'number' ? f.default : 0
  }
  return { features: values }
}

export default function ApiPanel({ endpoint, features, isClassification, isPublic }: {
  endpoint: string
  features: FeatureSchema[]
  isClassification: boolean
  isPublic: boolean
}) {
  const [lang, setLang] = useState<Lang>('curl')
  const base = endpoint.replace(/\/predict$/, '')
  const body = JSON.stringify(examplePayload(features), null, 2)
  const indented = (n: number) => body.split('\n').join('\n' + ' '.repeat(n))
  const key = 'YOUR_API_KEY'

  const snippets: Record<Lang, string> = {
    curl: [
      `curl -X POST ${endpoint} \\`,
      `  -H "Content-Type: application/json" \\`,
      ...(isPublic ? [] : [`  -H "X-API-Key: ${key}" \\`]),
      `  -d '${body.replace(/'/g, "'\\''")}'`,
    ].join('\n'),
    javascript: `const res = await fetch("${endpoint}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json"${isPublic ? '' : `, "X-API-Key": "${key}"`} },\n  body: JSON.stringify(${indented(2)}),\n});\nconst { prediction${isClassification ? ', probability' : ''} } = await res.json();`,
    python: `import requests\n\nres = requests.post(\n    "${endpoint}",\n    json=${indented(4)},${isPublic ? '' : `\n    headers={"X-API-Key": "${key}"},`}\n)\nprint(res.json())`,
  }
  const response = isClassification
    ? '{ "prediction": …, "probability": 0.93, "probabilities": [{ "label": …, "probability": 0.93 }, …] }'
    : '{ "prediction": 123.45 }'

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-zinc-800 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
          <CodeIcon className="text-zinc-400" /> REST API
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {isPublic ? (
            <>Call this model from any app — no key needed. <Link href="/docs" className="text-zinc-200 underline decoration-zinc-600 underline-offset-4">API docs</Link></>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1">
              <LockIcon size={13} className="text-zinc-500" /> Private model: send an{' '}
              <Link href="/dashboard/settings" className="text-zinc-200 underline decoration-zinc-600 underline-offset-4">API key</Link>{' '}
              in the <code className="kbd">X-API-Key</code> header.
            </span>
          )}
        </p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          {ENDPOINTS.map(({ path, label, hint }) => (
            <div key={path} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 py-2 pr-1.5 pl-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">POST</span>
                  <span className="text-xs font-medium text-zinc-200">{label}</span>
                  <span className="min-w-0 truncate text-xs text-zinc-500">{hint}</span>
                </div>
                {/* The model URL shortens in the middle so the endpoint path stays readable */}
                <code className="mt-1.5 flex min-w-0 font-mono text-xs text-zinc-500 sm:text-[13px]" title={`${base}${path}`}>
                  <span className="truncate">{base}</span>
                  <span className="shrink-0 text-zinc-200">{path}</span>
                </code>
              </div>
              <CopyButton value={`${base}${path}`} label="" className="btn btn-ghost btn-sm btn-icon w-8 shrink-0" />
            </div>
          ))}
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
