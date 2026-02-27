"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.VITE_API_URL || "http://localhost:4000";

export default function AdminNotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/notifications`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const data = await response.json();
      setRows(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = {
    total: rows.length,
    pending: rows.filter(r => r.status === "PENDING_APPROVAL").length,
    approved: rows.filter(r => r.status === "APPROVED").length,
    rejected: rows.filter(r => r.status === "REJECTED").length,
    sent: rows.filter(r => r.status === "SENT").length,
  };

  return (
    <main className="shell">
      <section className="hero">
        <h1>Admin Notifications</h1>
        <p>Review incoming job notifications, approve and send emails.</p>
      </section>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value brand">{counts.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value warn">{counts.pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value good">{counts.approved + counts.sent}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-value bad">{counts.rejected}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginBottom: 0 }}>All Notifications</h2>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>

        {error && <p className="notice error">{error}</p>}

        {loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 48 }} />)}
          </div>
        )}

        {!loading && !error && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Company</th>
                  <th>Eligible</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">No notifications found.</td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.jobId}>
                    <td className="mono">{row.jobId}</td>
                    <td style={{ fontWeight: 600 }}>{row.companyName}</td>
                    <td>{row.eligibleCount}</td>
                    <td>
                      <span className={`pill ${row.status}`}>
                        {row.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td>{new Date(row.applicationDeadline).toLocaleDateString()}</td>
                    <td>
                      <Link href={`/admin/notifications/${row.jobId}`} className="btn btn-ghost btn-sm">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
