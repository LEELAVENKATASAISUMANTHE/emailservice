"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function AdminNotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API_BASE}/api/admin/notifications`, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }
        const payload = await response.json();
        if (active) {
          setRows(payload.data || []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <h1>Admin Notifications</h1>
        <p>Review and process incoming job notifications.</p>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ marginBottom: 0 }}>Pending + Processed</h2>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>

        {loading && <p className="muted">Loading notifications...</p>}
        {error && <p className="notice error">{error}</p>}

        {!loading && !error && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Company</th>
                  <th>Eligible Count</th>
                  <th>Status</th>
                  <th>Application Deadline</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No notifications found.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.jobId}>
                    <td className="mono">{row.jobId}</td>
                    <td>{row.companyName}</td>
                    <td>{row.eligibleCount}</td>
                    <td>
                      <span className={`pill ${row.status}`}>{row.status}</span>
                    </td>
                    <td>{new Date(row.applicationDeadline).toLocaleString()}</td>
                    <td>
                      <Link href={`/admin/notifications/${row.jobId}`}>Open</Link>
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
