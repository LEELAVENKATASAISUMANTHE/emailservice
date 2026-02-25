import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <h1>Placement ERP Notification Console</h1>
        <p>
          Admin approval and student visibility powered by Kafka, MongoDB, and
          Redis sorted sets.
        </p>
      </section>

      <section className="card">
        <h2>Navigation</h2>
        <div className="row">
          <Link className="btn btn-ghost" href="/admin/notifications">
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
