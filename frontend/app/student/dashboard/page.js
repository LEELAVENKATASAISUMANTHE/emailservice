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
      setError("Student ID is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/student/dashboard?studentId=${encodeURIComponent(studentId.trim())}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
      setResult(payload);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") loadDashboard();
  }

  return (
    <main className="shell">
      <section className="hero">
        <h1>Student Dashboard</h1>
        <p>View active placement opportunities available for you.</p>
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 12 }}>Lookup Active Jobs</h2>
        <div className="row">
          <input
            className="input"
            placeholder="Enter student ID (e.g., 1BY23CS132)"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button className="btn btn-primary" onClick={loadDashboard} disabled={loading}>
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && <div className="notice error">{error}</div>}
      </section>

      {result && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value brand">{(result.activeJobIds || []).length}</div>
              <div className="stat-label">Active Jobs</div>
            </div>
            <div className="stat-card">
              <div className="stat-value good">{(result.jobs || []).length}</div>
              <div className="stat-label">Job Details</div>
            </div>
          </div>

          <section className="card">
            <h3>
              Jobs for <span className="mono" style={{ color: "var(--brand)" }}>{result.studentId}</span>
            </h3>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Company</th>
                    <th>Eligible</th>
                    <th>Status</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.jobs || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">No active jobs found.</td>
                    </tr>
                  )}
                  {(result.jobs || []).map((job) => (
                    <tr key={job.jobId}>
                      <td className="mono">{job.jobId}</td>
                      <td style={{ fontWeight: 600 }}>{job.companyName}</td>
                      <td>{job.eligibleCount}</td>
                      <td>
                        <span className={`pill ${job.status}`}>{job.status?.replace("_", " ")}</span>
                      </td>
                      <td>{new Date(job.applicationDeadline).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
