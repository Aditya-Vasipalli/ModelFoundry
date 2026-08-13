export default function Loading() {
  return (
    <div className="min-h-screen grid-bg">
      <nav className="flex items-center justify-between px-8 py-4 border-b"
        style={{ borderColor: 'var(--border)', background: 'rgba(8,11,20,0.85)' }}>
        <div className="text-lg font-bold gradient-text">⚗️ ModelFoundry</div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>My Models</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Loading...</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass p-6 h-28 flex items-center justify-center" style={{ opacity: 0.5 }}>
              <span className="pulse-dot" style={{ background: 'var(--text-muted)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
