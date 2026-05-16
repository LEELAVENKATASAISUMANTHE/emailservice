export default function SectionCard({ title, subtitle, children, className = '' }) {
  return (
    <section className={`card ${className}`.trim()}>
      <div style={{ marginBottom: subtitle ? 12 : 14 }}>
        <h3 style={{ marginBottom: subtitle ? 4 : 0 }}>{title}</h3>
        {subtitle && <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
