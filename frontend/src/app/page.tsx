import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black relative selection:bg-zinc-800 selection:text-white">
      {/* Subtle top spotlight */}
      <div 
        className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)' }} 
      />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-zinc-900 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-zinc-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">ModelFoundry</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">
            Log in
          </Link>
          <Link href="/login" className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-40 pb-24">
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-10 text-xs font-medium border border-zinc-800 bg-zinc-900/50 text-zinc-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Free • No credit card required
        </div>

        <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight max-w-4xl text-zinc-100 leading-[1.1]">
          Deploy your ML models as <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500">
            production ready APIs.
          </span>
        </h1>

        <p className="text-lg md:text-xl mb-10 max-w-2xl text-zinc-400 leading-relaxed font-light">
          Upload a CSV, select a model architecture, and instantly receive a live prediction endpoint. Zero configuration, auto-preprocessing, and instant scaling.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/login" className="btn-primary" style={{ padding: '12px 28px', fontSize: '15px' }}>
            Start Deploying
          </Link>
          <a href="https://github.com/Aditya-Vasipalli/ModelFoundry" target="_blank" rel="noreferrer"
            className="btn-ghost" style={{ padding: '12px 28px', fontSize: '15px' }}>
            <svg className="w-5 h-5 mr-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            View Documentation
          </a>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-32 max-w-5xl w-full text-left px-4">
          {[
            { 
              icon: (
                <svg className="w-5 h-5 text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
              ),
              title: 'Automated Pipeline', 
              desc: 'Missing values imputation, categorical encoding, scaling, and collinearity checks handled entirely via Pandas & Scikit-Learn.' 
            },
            { 
              icon: (
                <svg className="w-5 h-5 text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.433 4.433 0 002.906 2.907 4.494 4.494 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
              ),
              title: 'Multiple Architectures', 
              desc: 'Train Logistic Regression, Random Forest, or Linear Regression models. Models are automatically evaluated and metrics logged.' 
            },
            { 
              icon: (
                <svg className="w-5 h-5 text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              ),
              title: 'Instant Endpoints', 
              desc: 'Every successful training job yields a live, public-facing inference endpoint and a dynamically generated UI for predictions.' 
            },
          ].map((f) => (
            <div key={f.title} className="glass card-hover flex flex-col p-6 group">
              <div className="w-10 h-10 rounded-lg border border-zinc-800 bg-zinc-900/50 flex items-center justify-center mb-5 group-hover:border-zinc-700 transition-colors">
                {f.icon}
              </div>
              <h3 className="text-base font-semibold mb-2 text-zinc-100 tracking-tight">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
