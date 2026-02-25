"use client";

import { useState } from "react";

const API_BASE = process.env.VITE_API_URL || "http://localhost:4000";

export default function StudentDashboardPage() {
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function loadDashboard() {
    if (!studentId.trim()) {
      setError("studentId is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/student/dashboard?studentId=${encodeURIComponent(
          studentId.trim()
        )}`,
        { cache: "no-store" }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `Request failed with ${response.status}`);
      }

      setResult(payload);
    } catch (loadError) {
      setResult(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <h1>Student Dashboard</h1>
        <p>Shows active jobs from Redis sorted-set visibility.</p>
      </section>

      <section className="card">
        <h2>Lookup Active Jobs</h2>
        <div className="row">
          <input
            className="input"
            placeholder="Enter student ID (e.g., 1BY23CS132)"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button className="btn btn-primary" onClick={loadDashboard} disabled={loading}>
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>

        {error && <p className="notice error">{error}</p>}

        {result && (
          <>
            <div style={{ height: 14 }} />
            <p className="muted">
              Student: <span className="mono">{result.studentId}</span>
            </p>
            <p className="muted">
              Active Job IDs:{" "}
              <span className="mono">{(result.activeJobIds || []).join(", ") || "None"}</span>
            </p>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Company</th>
                    <th>Eligible Count</th>
                    <th>Status</th>
                    <th>Application Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.jobs || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No active jobs.
                      </td>
                    </tr>
                  )}
                  {(result.jobs || []).map((job) => (
                    <tr key={job.jobId}>
                      <td className="mono">{job.jobId}</td>
                      <td>{job.companyName}</td>
                      <td>{job.eligibleCount}</td>
                      <td>
                        <span className={`pill ${job.status}`}>{job.status}</span>
                      </td>
                      <td>{new Date(job.applicationDeadline).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
