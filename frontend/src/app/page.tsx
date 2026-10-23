import Link from 'next/link'
import { getUser } from '@/utils/supabase/server'
import { Logo } from '@/components/ui'
import {
  ArrowRightIcon, ChartIcon, CodeIcon, GaugeIcon, GithubIcon, ServerIcon, ShieldIcon, TargetIcon, UploadIcon, WandIcon, ZapIcon,
} from '@/components/icons'

const GITHUB_URL = 'https://github.com/Aditya-Vasipalli/ModelFoundry'

const STEPS = [
  { icon: UploadIcon, title: 'Upload a CSV', desc: 'Drop in any table with a header row — comma, semicolon or tab separated.' },
  { icon: TargetIcon, title: 'Pick what to predict', desc: 'Choose the target column. We suggest the right kind of model for it.' },
  { icon: ZapIcon, title: 'Predict anywhere', desc: 'Use the generated form, score a whole CSV, share a public link, or call the REST endpoint.' },
]

const FEATURES = [
  { icon: WandIcon, title: 'Auto mode', desc: 'Compares 7 algorithms with cross-validation and keeps the best, with a leaderboard to show its work.' },
  { icon: ChartIcon, title: '17 algorithms', desc: 'Gradient boosting, random forests, SVMs, k-NN, naive Bayes, ridge, lasso and more, for classification and regression.' },
  { icon: GaugeIcon, title: 'Explained results', desc: 'Feature importance, confusion matrix or predicted-vs-actual, cross-validated scores and a dataset summary.' },
  { icon: CodeIcon, title: 'REST API & batch scoring', desc: 'A stable endpoint per model, batch predictions for up to 1,000 rows, and CSV in, CSV out from the dashboard.' },
  { icon: ShieldIcon, title: 'Private models & API keys', desc: 'Keep a model private and call it with hashed API keys. Datasets are deleted right after training.' },
  { icon: ServerIcon, title: 'Runs on your hardware', desc: 'One docker compose command runs the trainer and API, exposed through a secure tunnel.' },
]

function HeroVisual() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-4xl sm:mt-20">
      <div className="absolute -inset-x-8 -top-8 -bottom-8 rounded-[2rem] bg-gradient-to-b from-white/[0.07] to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/90 text-left shadow-2xl shadow-black">
        <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-3">
          <span className="size-2.5 rounded-full bg-zinc-700" />
          <span className="size-2.5 rounded-full bg-zinc-700" />
          <span className="size-2.5 rounded-full bg-zinc-700" />
          <span className="ml-3 truncate font-mono text-[11px] text-zinc-500">POST /api/v1/models/677a…/predict</span>
        </div>
        <div className="grid md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4 border-b border-zinc-800 p-5 md:border-r md:border-b-0 sm:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-100">titanic</p>
              <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 text-[11px] text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" /> Ready
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['Accuracy', '81.0%'], ['F1 score', '81.0%']].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <p className="text-[11px] text-zinc-500">{k}</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-emerald-300">{v}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[['Sex', 'female'], ['Pclass', '1'], ['Age', '29']].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-xs">
                  <span className="text-zinc-500">{k}</span>
                  <span className="font-mono text-zinc-200">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-relaxed sm:p-6 sm:text-[13px]">
            <span className="text-zinc-500">{'// response'}</span>{'\n'}
            <span className="text-zinc-400">{'{'}</span>{'\n'}
            {'  '}<span className="text-sky-300">&quot;prediction&quot;</span><span className="text-zinc-500">: </span><span className="text-amber-200">1</span><span className="text-zinc-500">,</span>{'\n'}
            {'  '}<span className="text-sky-300">&quot;probability&quot;</span><span className="text-zinc-500">: </span><span className="text-amber-200">0.99</span><span className="text-zinc-500">,</span>{'\n'}
            {'  '}<span className="text-sky-300">&quot;probabilities&quot;</span><span className="text-zinc-500">: [</span>{'\n'}
            {'    '}<span className="text-zinc-500">{'{ '}</span><span className="text-sky-300">&quot;label&quot;</span><span className="text-zinc-500">: </span><span className="text-amber-200">1</span><span className="text-zinc-500">, </span><span className="text-sky-300">&quot;probability&quot;</span><span className="text-zinc-500">: </span><span className="text-amber-200">0.99</span><span className="text-zinc-500">{' },'}</span>{'\n'}
            {'    '}<span className="text-zinc-500">{'{ '}</span><span className="text-sky-300">&quot;label&quot;</span><span className="text-zinc-500">: </span><span className="text-amber-200">0</span><span className="text-zinc-500">, </span><span className="text-sky-300">&quot;probability&quot;</span><span className="text-zinc-500">: </span><span className="text-amber-200">0.01</span><span className="text-zinc-500">{' }'}</span>{'\n'}
            {'  '}<span className="text-zinc-500">]</span>{'\n'}
            <span className="text-zinc-400">{'}'}</span>
          </pre>
        </div>
      </div>
    </div>
  )
}

export default async function LandingPage() {
  const user = await getUser()
  const primaryHref = user ? '/dashboard' : '/login'

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[900px]" />
      <div className="bg-spotlight pointer-events-none absolute inset-x-0 top-0 h-[700px]" />

      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-zinc-900/80 bg-[#050506]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="btn btn-ghost btn-sm hidden sm:inline-flex">How it works</a>
            <Link href="/docs" className="btn btn-ghost btn-sm hidden sm:inline-flex">Docs</Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm btn-icon w-8 sm:w-auto sm:px-3" aria-label="GitHub">
              <GithubIcon /> <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link href={primaryHref} className="btn btn-primary btn-sm ml-1">
              {user ? 'Dashboard' : 'Get started'}
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24 sm:pb-28">
          <div className="animate-fade-up mx-auto inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Free &amp; open source
          </div>

          <h1 className="animate-fade-up mx-auto mt-8 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-zinc-50 sm:text-6xl md:text-7xl">
            Turn any CSV into a{' '}
            <span className="bg-gradient-to-b from-zinc-100 to-zinc-500 bg-clip-text text-transparent">live prediction API</span>
          </h1>

          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty text-zinc-400 sm:text-lg">
            Upload a dataset, choose what to predict, and get a trained model with a shareable
            predictor page and a REST endpoint. No notebooks, no infrastructure.
          </p>

          <div className="animate-fade-up mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href={primaryHref} className="btn btn-primary btn-lg">
              {user ? 'Open dashboard' : 'Start for free'} <ArrowRightIcon />
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn btn-secondary btn-lg">
              <GithubIcon /> View on GitHub
            </a>
          </div>

          <HeroVisual />
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-t border-zinc-900 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium text-zinc-500">How it works</p>
            <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              From spreadsheet to endpoint in three steps
            </h2>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="card relative p-6">
                  <span className="absolute top-6 right-6 font-mono text-xs text-zinc-700">0{i + 1}</span>
                  <span className="flex size-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200">
                    <step.icon size={18} />
                  </span>
                  <h3 className="mt-5 font-medium text-zinc-100">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-zinc-900 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium text-zinc-500">Features</p>
            <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              The boring parts of ML, done for you
            </h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-[#08080a] p-6 sm:p-8">
                  <f.icon size={20} className="text-zinc-300" />
                  <h3 className="mt-4 font-medium text-zinc-100">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-900 px-4 py-20 sm:px-6 sm:py-28">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-14 text-center sm:px-12 sm:py-20">
            <div className="bg-spotlight pointer-events-none absolute inset-0" />
            <h2 className="relative text-3xl font-semibold tracking-tight text-balance text-zinc-50 sm:text-4xl">
              Your next model is one upload away
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-zinc-400">
              Sign in with Google and train your first model in under a minute.
            </p>
            <Link href={primaryHref} className="btn btn-primary btn-lg relative mt-8">
              {user ? 'Open dashboard' : 'Get started'} <ArrowRightIcon />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
          <Logo />
          <p>Built with Next.js, Supabase and scikit-learn.</p>
        </div>
      </footer>
    </div>
  )
}
