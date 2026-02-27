"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.VITE_API_URL || "http://localhost:4000";

export default function NotificationDetailPage() {
    const { jobId } = useParams();
    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Compose state
    const [emailBody, setEmailBody] = useState("");
    const [adminMessage, setAdminMessage] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    // Reject state
    const [rejectMessage, setRejectMessage] = useState("");
    const [showRejectForm, setShowRejectForm] = useState(false);

    async function loadNotification() {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API_BASE}/api/notifications/${jobId}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Failed to load (${res.status})`);
            const data = await res.json();
            setNotification(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadNotification(); }, [jobId]);

    // File handling
    const addFiles = useCallback((files) => {
        const newFiles = Array.from(files).filter(f => {
            return !attachments.some(existing => existing.name === f.name && existing.size === f.size);
        });
        setAttachments(prev => [...prev, ...newFiles]);
    }, [attachments]);

    const removeFile = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
        }
    };

    // Approve handler
    async function handleApprove() {
        if (!emailBody.trim()) {
            setResult({ type: "error", message: "Email body is required" });
            return;
        }

        setSubmitting(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("emailBody", emailBody);
            if (adminMessage.trim()) formData.append("adminMessage", adminMessage);
            attachments.forEach(file => formData.append("attachments", file));

            const res = await fetch(`${API_BASE}/api/notifications/${jobId}/approve`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

            setResult({
                type: "ok",
                message: `✅ Approved! ${data.emailsQueued} email(s) queued, ${data.attachmentsUploaded || 0} attachment(s) uploaded.`
            });
            loadNotification();
        } catch (err) {
            setResult({ type: "error", message: err.message });
        } finally {
            setSubmitting(false);
        }
    }

    // Reject handler
    async function handleReject() {
        setSubmitting(true);
        setResult(null);

        try {
            const res = await fetch(`${API_BASE}/api/notifications/${jobId}/reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adminMessage: rejectMessage || null }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

            setResult({ type: "ok", message: "❌ Notification rejected." });
            setShowRejectForm(false);
            loadNotification();
        } catch (err) {
            setResult({ type: "error", message: err.message });
        } finally {
            setSubmitting(false);
        }
    }

    // Format file size
    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // File icon by type
    function fileIcon(name) {
        const ext = name.split(".").pop().toLowerCase();
        if (["pdf"].includes(ext)) return "📄";
        if (["xlsx", "xls", "csv"].includes(ext)) return "📊";
        if (["doc", "docx"].includes(ext)) return "📝";
        if (["png", "jpg", "jpeg", "gif"].includes(ext)) return "🖼️";
        if (["zip", "rar", "7z"].includes(ext)) return "📦";
        return "📎";
    }

    const isPending = notification?.status === "PENDING_APPROVAL";

    if (loading) {
        return (
            <main className="shell">
                <div className="back-link">← Back</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="skeleton" style={{ height: 36, width: "60%" }} />
                    <div className="skeleton" style={{ height: 20, width: "40%" }} />
                    <div className="skeleton" style={{ height: 300 }} />
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="shell">
                <Link href="/admin/notifications" className="back-link">← Back to list</Link>
                <div className="notice error">{error}</div>
            </main>
        );
    }

    if (!notification) {
        return (
            <main className="shell">
                <Link href="/admin/notifications" className="back-link">← Back to list</Link>
                <div className="notice error">Notification not found.</div>
            </main>
        );
    }

    return (
        <main className="shell">
            <Link href="/admin/notifications" className="back-link">← Back to notifications</Link>

            {/* Header */}
            <section className="hero">
                <div className="row" style={{ alignItems: "center", gap: 14 }}>
                    <h1 style={{ marginBottom: 0 }}>Job #{notification.jobId} — {notification.companyName}</h1>
                    <span className={`pill ${notification.status}`}>
                        {notification.status?.replace("_", " ")}
                    </span>
                </div>
                <p>Created {new Date(notification.createdAt).toLocaleString()}</p>
            </section>

            <div className="split">
                {/* Left: Job details */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <section className="card">
                        <h3 style={{ marginBottom: 14 }}>Job Details</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="info-label">Company</span>
                                <span className="info-value">{notification.companyName}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Eligible Students</span>
                                <span className="info-value">{notification.eligibleCount}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Deadline</span>
                                <span className="info-value">
                                    {new Date(notification.applicationDeadline).toLocaleDateString("en-IN", {
                                        day: "numeric", month: "short", year: "numeric"
                                    })}
                                </span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Status</span>
                                <span className={`pill ${notification.status}`}>
                                    {notification.status?.replace("_", " ")}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Criteria */}
                    {notification.criteria && (
                        <section className="card">
                            <h3 style={{ marginBottom: 10 }}>Eligibility Criteria</h3>
                            <pre style={{
                                background: "#f0f4f8",
                                padding: 14,
                                borderRadius: 10,
                                fontSize: "0.85rem",
                                overflow: "auto",
                                margin: 0,
                                fontFamily: "var(--font-mono), monospace"
                            }}>
                                {JSON.stringify(notification.criteria, null, 2)}
                            </pre>
                        </section>
                    )}

                    {/* Students list */}
                    {notification.eligibleStudents && notification.eligibleStudents.length > 0 && (
                        <section className="card">
                            <h3 style={{ marginBottom: 10 }}>
                                Eligible Students ({notification.eligibleStudents.length})
                            </h3>
                            <div className="students-scroll">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notification.eligibleStudents.map((s, i) => (
                                            <tr key={i}>
                                                <td className="mono" style={{ fontSize: "0.85rem" }}>{s.student_id}</td>
                                                <td>{s.full_name}</td>
                                                <td style={{ fontSize: "0.85rem" }}>{s.email}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>

                {/* Right: Email compose */}
                <div>
                    {isPending ? (
                        <div className="compose-shell">
                            <div className="compose-topbar">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                                Compose Email
                            </div>

                            {/* To field */}
                            <div className="compose-row">
                                <span className="compose-key">To</span>
                                <div className="compose-value">
                                    <span style={{ color: "var(--brand)", fontWeight: 600 }}>
                                        {notification.eligibleCount} eligible student{notification.eligibleCount !== 1 ? "s" : ""}
                                    </span>
                                </div>
                            </div>

                            {/* Subject field */}
                            <div className="compose-row">
                                <span className="compose-key">Subject</span>
                                <div className="compose-value">
                                    <span style={{ color: "var(--ink)" }}>
                                        Placement Opportunity — {notification.companyName}
                                    </span>
                                </div>
                            </div>

                            {/* Toolbar */}
                            <div className="compose-editor-shell">
                                <div className="compose-toolbar">
                                    <div className="compose-tool-group">
                                        <span className="compose-tool compose-tool-bold">B</span>
                                        <span className="compose-tool compose-tool-italic">I</span>
                                        <span className="compose-tool compose-tool-underline">U</span>
                                    </div>
                                    <div className="compose-tool-divider" />
                                    <div className="compose-tool-group">
                                        <span className="compose-tool">H1</span>
                                        <span className="compose-tool">H2</span>
                                    </div>
                                    <div className="compose-tool-divider" />
                                    <div className="compose-tool-group">
                                        <span className="compose-tool">• List</span>
                                        <span className="compose-tool">1. List</span>
                                    </div>
                                </div>

                                {/* Email body textarea */}
                                <textarea
                                    className="textarea compose-body"
                                    placeholder={`Dear Student,\n\nWe are pleased to inform you that ${notification.companyName} has opened a new placement opportunity.\n\nRole: [Position]\nPackage: [CTC]\nDeadline: ${new Date(notification.applicationDeadline).toLocaleDateString("en-IN")}\n\nPlease apply through the placement portal.\n\nBest regards,\nPlacement Cell`}
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>

                            {/* Footer: attachments + actions */}
                            <div className="compose-footer">
                                <div className="compose-attachments">
                                    <span className="compose-attach-label">
                                        📎 Attachments (optional)
                                    </span>

                                    {/* Dropzone */}
                                    <div
                                        className={`dropzone ${dragOver ? "drag-over" : ""}`}
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={handleDrop}
                                    >
                                        <div className="dropzone-text">
                                            <strong>Click to upload</strong> or drag and drop
                                            <br />
                                            <span style={{ fontSize: "0.78rem" }}>PDF, Excel, Word, Images (max 10MB each)</span>
                                        </div>
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                            addFiles(e.target.files);
                                            e.target.value = "";
                                        }}
                                        accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif,.zip,.rar"
                                    />

                                    {/* File chips */}
                                    {attachments.length > 0 && (
                                        <div className="file-chips">
                                            {attachments.map((file, i) => (
                                                <div key={i} className="file-chip">
                                                    {fileIcon(file.name)} {file.name}
                                                    <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                                                        ({formatSize(file.size)})
                                                    </span>
                                                    <button
                                                        className="file-chip-remove"
                                                        onClick={() => removeFile(i)}
                                                        title="Remove"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Admin message */}
                            <div style={{ padding: "0 16px 14px" }}>
                                <label className="label">Admin Note (optional)</label>
                                <textarea
                                    className="textarea"
                                    style={{ minHeight: 60 }}
                                    placeholder="Add an internal note about this approval..."
                                    value={adminMessage}
                                    onChange={(e) => setAdminMessage(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{
                                padding: "14px 16px",
                                borderTop: "1px solid #edf1f5",
                                background: "#fbfcfe",
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap"
                            }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleApprove}
                                    disabled={submitting}
                                >
                                    {submitting ? "Sending..." : "✅ Approve & Send Emails"}
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => setShowRejectForm(!showRejectForm)}
                                    disabled={submitting}
                                >
                                    ❌ Reject
                                </button>
                            </div>

                            {/* Reject form */}
                            {showRejectForm && (
                                <div style={{ padding: "0 16px 16px" }}>
                                    <label className="label">Rejection Reason</label>
                                    <textarea
                                        className="textarea"
                                        style={{ minHeight: 60 }}
                                        placeholder="Explain why this notification is being rejected..."
                                        value={rejectMessage}
                                        onChange={(e) => setRejectMessage(e.target.value)}
                                        disabled={submitting}
                                    />
                                    <div style={{ marginTop: 10 }}>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={handleReject}
                                            disabled={submitting}
                                        >
                                            {submitting ? "Rejecting..." : "Confirm Rejection"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Result notice */}
                            {result && (
                                <div style={{ padding: "0 16px 16px" }}>
                                    <div className={`notice ${result.type}`}>{result.message}</div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Already processed */
                        <section className="card">
                            <h3>Email Status</h3>
                            <div className="info-grid" style={{ marginBottom: 14 }}>
                                <div className="info-item">
                                    <span className="info-label">Status</span>
                                    <span className={`pill ${notification.status}`}>
                                        {notification.status?.replace("_", " ")}
                                    </span>
                                </div>
                                {notification.approvedAt && (
                                    <div className="info-item">
                                        <span className="info-label">Approved At</span>
                                        <span className="info-value">
                                            {new Date(notification.approvedAt).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {notification.rejectedAt && (
                                    <div className="info-item">
                                        <span className="info-label">Rejected At</span>
                                        <span className="info-value">
                                            {new Date(notification.rejectedAt).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {notification.adminMessage && (
                                <div style={{ marginTop: 10 }}>
                                    <span className="info-label">Admin Note</span>
                                    <p style={{ margin: "6px 0 0", color: "var(--ink)" }}>
                                        {notification.adminMessage}
                                    </p>
                                </div>
                            )}
                            {notification.adminMessageTextFile && (
                                <div style={{ marginTop: 10 }}>
                                    <span className="info-label">Email Body (MinIO)</span>
                                    <p className="mono" style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                                        {notification.adminMessageTextFile}
                                    </p>
                                </div>
                            )}
                            {notification.attachments && notification.attachments.length > 0 && (
                                <div style={{ marginTop: 10 }}>
                                    <span className="info-label">Attachments</span>
                                    <div className="file-chips" style={{ marginTop: 6 }}>
                                        {notification.attachments.map((path, i) => (
                                            <div key={i} className="file-chip">
                                                📎 {path.split("/").pop()}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </main>
    );
}
