import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen grid-bg relative overflow-hidden">
      {/* Glow orbs */}
      <div className="absolute top-[-200px] left-[20%] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-100px] right-[10%] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)' }} />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-lg font-bold gradient-text">⚗️ ModelFoundry</span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost" style={{ padding: '8px 16px', fontSize: '13px' }}>
            Sign In
          </Link>
          <Link href="/login" className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
            Get Started →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-32 pb-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-sm font-medium"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--accent-hover)' }}>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"></span>
          Free • No credit card required
        </div>

        <h1 className="text-6xl font-extrabold mb-6 leading-tight max-w-3xl"
          style={{ color: 'var(--text-primary)' }}>
          Turn your dataset into a{' '}
          <span className="gradient-text">prediction API</span>
        </h1>

        <p className="text-xl mb-10 max-w-xl" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Upload a CSV, pick a model, and get a live prediction endpoint.
          No code. No infrastructure. Just results.
        </p>

        <div className="flex items-center gap-4">
          <Link href="/login" className="btn-primary" style={{ padding: '14px 28px', fontSize: '16px' }}>
            Start Building →
          </Link>
          <a href="https://github.com/Aditya-Vasipalli/ModelFoundry" target="_blank"
            className="btn-ghost" style={{ padding: '14px 28px', fontSize: '16px' }}>
            View on GitHub
          </a>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 max-w-4xl w-full text-left">
          {[
            { icon: '🧹', title: 'Auto Preprocessing', desc: 'Missing values, encoding, scaling, and collinearity checks — fully automated.' },
            { icon: '🤖', title: '4 ML Models', desc: 'Logistic Regression, Random Forest, Linear Regression — trained and evaluated automatically.' },
            { icon: '🔗', title: 'Shareable API', desc: 'Every trained model gets a live prediction endpoint you can use immediately.' },
          ].map((f) => (
            <div key={f.title} className="glass card-hover p-6" style={{ padding: '24px' }}>
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
