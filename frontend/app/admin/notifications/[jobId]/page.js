"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.VITE_API_URL || "http://localhost:4000";

export default function AdminNotificationDetailPage() {
  const params = useParams();
  const jobId = useMemo(() => params?.jobId, [params]);

  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("ok");

  async function loadNotification() {
    if (!jobId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/admin/notifications/${encodeURIComponent(jobId)}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const data = await response.json();
      setNotification(data);
      setAdminMessage(data.adminMessage || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const readOnly =
    notification &&
    (notification.status === "REJECTED" ||
      notification.status === "APPROVED" ||
      notification.status === "SENT");

  async function onApprove() {
    if (!notification) {
      return;
    }

    setSubmitting(true);
    setNotice("");
    setNoticeType("ok");

    try {
      const formData = new FormData();
      formData.append("adminMessage", adminMessage);
      for (const file of files) {
        formData.append("attachments", file);
      }

      const response = await fetch(
        `${API_BASE}/api/admin/notifications/${notification.jobId}/approve`,
        {
          method: "POST",
          body: formData
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `Request failed with ${response.status}`);
      }

      setNotice(payload.message || "Approved successfully.");
      setNoticeType("ok");
      await loadNotification();
    } catch (approveError) {
      setNotice(approveError.message);
      setNoticeType("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onReject() {
    if (!notification) {
      return;
    }

    setSubmitting(true);
    setNotice("");
    setNoticeType("ok");

    try {
      const response = await fetch(
        `${API_BASE}/api/admin/notifications/${notification.jobId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            adminMessage
          })
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `Request failed with ${response.status}`);
      }

      setNotice(payload.message || "Rejected successfully.");
      setNoticeType("ok");
      await loadNotification();
    } catch (rejectError) {
      setNotice(rejectError.message);
      setNoticeType("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <h1>Notification Detail</h1>
        <p>
          <Link href="/admin/notifications">Back to list</Link>
        </p>
      </section>

      {loading && <p className="muted">Loading notification...</p>}
      {error && <p className="notice error">{error}</p>}

      {!loading && !error && notification && (
        <div className="split">
          <section className="card">
            <h2>
              Job <span className="mono">{notification.jobId}</span> |{" "}
              {notification.companyName}
            </h2>
            <p>
              <span className={`pill ${notification.status}`}>
                {notification.status}
              </span>
            </p>
            <p className="muted">
              Eligible Count: {notification.eligibleCount}
              <br />
              Application Deadline:{" "}
              {new Date(notification.applicationDeadline).toLocaleString()}
            </p>

            <h3>Criteria</h3>
            <pre className="code">
              {JSON.stringify(notification.criteria || {}, null, 2)}
            </pre>

            <h3>Eligible Students</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {(notification.eligibleStudents || []).map((student) => (
                    <tr key={student.student_id}>
                      <td className="mono">{student.student_id}</td>
                      <td>{student.full_name}</td>
                      <td>{student.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Admin Action</h2>
            <p className="muted">
              Only <span className="mono">PENDING_APPROVAL</span> can be
              processed.
            </p>

            <label htmlFor="adminMessage">Email Body / Admin Message</label>
            <textarea
              id="adminMessage"
              className="textarea"
              value={adminMessage}
              onChange={(event) => setAdminMessage(event.target.value)}
              disabled={readOnly || submitting}
            />

            <div style={{ height: 12 }} />

            <label htmlFor="attachments">Attachments</label>
            <input
              id="attachments"
              type="file"
              multiple
              className="file"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              disabled={readOnly || submitting}
            />

            <div style={{ height: 12 }} />
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={onApprove}
                disabled={readOnly || submitting}
              >
                Approve
              </button>
              <button
                className="btn btn-danger"
                onClick={onReject}
                disabled={readOnly || submitting}
              >
                Reject
              </button>
            </div>

            {notification.attachments && notification.attachments.length > 0 && (
              <>
                <div style={{ height: 18 }} />
                <h3>Uploaded Attachments</h3>
                <ul>
                  {notification.attachments.map((item) => (
                    <li key={item}>
                      <a href={`${API_BASE}${item}`} target="_blank" rel="noreferrer">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {notice && <p className={`notice ${noticeType}`}>{notice}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
