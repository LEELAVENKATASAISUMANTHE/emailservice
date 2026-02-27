import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <h1>Placement ERP Notification Console</h1>
        <p>
          Manage job notifications, approve emails, and track delivery — all in one place.
        </p>
      </section>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value brand">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px" }}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div className="stat-label">Email Service</div>
        </div>
        <div className="stat-card">
          <div className="stat-value brand">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px" }}>
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="stat-label">Admin Approval</div>
        </div>
        <div className="stat-card">
          <div className="stat-value brand">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px" }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="stat-label">Student Visibility</div>
        </div>
      </div>

      <section className="card">
        <h2>Get Started</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Navigate to the admin panel to review pending notifications or check the student dashboard.
        </p>
        <div className="row">
          <Link className="btn btn-primary" href="/admin/notifications">
            Admin Notifications
          </Link>
          <Link className="btn btn-ghost" href="/student/dashboard">
            Student Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
