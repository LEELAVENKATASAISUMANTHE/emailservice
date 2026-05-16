import { Link, useParams } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import SectionCard from '../../components/ui/SectionCard';
import MetaItem from '../../components/ui/MetaItem';
import { apiGet, apiPostForm, apiPostJson } from '../../lib/apiClient';

export default function NotificationDetailPage() {
    const { jobId } = useParams();
    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [emailBody, setEmailBody] = useState('');
    const [adminMessage, setAdminMessage] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);

    const [rejectMessage, setRejectMessage] = useState('');
    const [showRejectForm, setShowRejectForm] = useState(false);

    async function loadNotification() {
        setLoading(true);
        setError('');
        try {
            const data = await apiGet(`/api/notifications/${encodeURIComponent(jobId)}`);
            setNotification(data);

            if (data.adminMessageTextFile) {
                const bodyData = await apiGet(`/api/notifications/${encodeURIComponent(jobId)}/email-body`);
                setEmailBody(bodyData.body || '');
            } else {
                setEmailBody('');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadNotification(); }, [jobId]);

    const addFiles = useCallback((files) => {
        const newFiles = Array.from(files).filter((file) => (
            !attachments.some((existing) => existing.name === file.name && existing.size === file.size)
        ));
        setAttachments((prev) => [...prev, ...newFiles]);
    }, [attachments]);

    const removeFile = (index) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
        }
    };

    async function handleApprove() {
        if (!emailBody.trim()) {
            setResult({ type: 'error', message: 'Email body is required.' });
            return;
        }

        setSubmitting(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('emailBody', emailBody);
            if (adminMessage.trim()) formData.append('adminMessage', adminMessage);
            attachments.forEach((file) => formData.append('attachments', file));

            const data = await apiPostForm(`/api/notifications/${encodeURIComponent(jobId)}/approve`, formData);

            setResult({
                type: 'ok',
                message: `Approved. ${data.emailsQueued} email(s) queued, ${data.attachmentsUploaded || 0} attachment(s) uploaded.`,
            });
            loadNotification();
        } catch (err) {
            setResult({ type: 'error', message: err.message });
        } finally {
            setSubmitting(false);
        }
    }

    async function handleReject() {
        setSubmitting(true);
        setResult(null);

        try {
            await apiPostJson(`/api/notifications/${encodeURIComponent(jobId)}/reject`, {
                adminMessage: rejectMessage || null,
            });

            setResult({ type: 'ok', message: 'Notification rejected.' });
            setShowRejectForm(false);
            loadNotification();
        } catch (err) {
            setResult({ type: 'error', message: err.message });
        } finally {
            setSubmitting(false);
        }
    }

    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (ext === 'pdf') return 'PDF';
        if (['xlsx', 'xls', 'csv'].includes(ext)) return 'XLS';
        if (['doc', 'docx'].includes(ext)) return 'DOC';
        if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'IMG';
        if (['zip', 'rar', '7z'].includes(ext)) return 'ZIP';
        return 'FILE';
    }

    function applyFormat(type) {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = emailBody.substring(start, end);

        let newText;
        let cursorStart;
        let cursorEnd;

        if (type === 'h1' || type === 'h2' || type === 'ul' || type === 'ol') {
            const prefix = { h1: '# ', h2: '## ', ul: '- ', ol: '1. ' }[type];
            const lineStart = emailBody.lastIndexOf('\n', start - 1) + 1;
            newText = emailBody.substring(0, lineStart) + prefix + emailBody.substring(lineStart);
            cursorStart = start + prefix.length;
            cursorEnd = end + prefix.length;
        } else {
            const [before, after] = { bold: ['**', '**'], italic: ['*', '*'], underline: ['<u>', '</u>'] }[type];
            newText = emailBody.substring(0, start) + before + selected + after + emailBody.substring(end);
            cursorStart = start + before.length;
            cursorEnd = end + before.length + selected.length;
        }

        setEmailBody(newText);
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(cursorStart, cursorEnd);
        }, 0);
    }

    const isPending = !notification?.status || notification?.status === 'PENDING_APPROVAL';
    const deadlineText = notification
        ? new Date(notification.applicationDeadline).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
        : '';

    if (loading) {
        return (
            <main className="shell">
                <Link to="/admin/notifications" className="back-link">Back to notifications</Link>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="skeleton" style={{ height: 36, width: '60%' }} />
                    <div className="skeleton" style={{ height: 20, width: '40%' }} />
                    <div className="skeleton" style={{ height: 300 }} />
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="shell">
                <Link to="/admin/notifications" className="back-link">Back to list</Link>
                <div className="notice error">{error}</div>
            </main>
        );
    }

    if (!notification) {
        return (
            <main className="shell">
                <Link to="/admin/notifications" className="back-link">Back to list</Link>
                <div className="notice error">Notification not found.</div>
            </main>
        );
    }

    return (
        <main className="shell">
            <Link to="/admin/notifications" className="back-link">Back to notifications</Link>

            <section className="hero">
                <div className="row" style={{ alignItems: 'center', gap: 14 }}>
                    <h1 style={{ marginBottom: 0 }}>Job #{notification.jobId} - {notification.companyName}</h1>
                    <span className={`pill ${notification.status}`}>
                        {notification.status?.replace('_', ' ')}
                    </span>
                </div>
                <p>Created {new Date(notification.createdAt).toLocaleString()}</p>
            </section>

            {result && (
                <div className={`notice ${result.type}`} style={{ marginBottom: 18 }}>
                    {result.message}
                </div>
            )}

            <SectionCard
                title="Decision"
                subtitle={isPending
                    ? 'Review the draft, then approve or reject this notification.'
                    : 'This notification is closed. Review the sent output and audit details below.'}
                className="workflow-section"
            >
                <div className="info-grid" style={{ marginBottom: 16 }}>
                    <MetaItem label="Status" value={<span className={`pill ${notification.status}`}>{notification.status?.replace('_', ' ')}</span>} />
                    {notification.approvedAt && (
                        <MetaItem label="Approved At" value={new Date(notification.approvedAt).toLocaleString()} />
                    )}
                    {notification.rejectedAt && (
                        <MetaItem label="Rejected At" value={new Date(notification.rejectedAt).toLocaleString()} />
                    )}
                </div>

                {isPending ? (
                    <>
                        <div style={{ marginBottom: 14 }}>
                            <label className="label">Internal note</label>
                            <textarea
                                className="textarea"
                                style={{ minHeight: 70 }}
                                placeholder="Optional note for internal review..."
                                value={adminMessage}
                                onChange={(e) => setAdminMessage(e.target.value)}
                                disabled={submitting}
                            />
                        </div>

                        {showRejectForm && (
                            <div style={{ marginBottom: 14 }}>
                                <label className="label">Rejection reason</label>
                                <textarea
                                    className="textarea"
                                    style={{ minHeight: 70 }}
                                    placeholder="Explain why this notification is being rejected..."
                                    value={rejectMessage}
                                    onChange={(e) => setRejectMessage(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>
                        )}

                        <div className="compose-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleApprove}
                                disabled={submitting}
                            >
                                {submitting ? 'Sending...' : 'Approve and send'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => setShowRejectForm((v) => !v)}
                                disabled={submitting}
                            >
                                {showRejectForm ? 'Hide rejection' : 'Reject'}
                            </button>
                            {showRejectForm && (
                                <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={handleReject}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Rejecting...' : 'Confirm rejection'}
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <p className="muted" style={{ margin: 0 }}>
                        No further action is available for this notification.
                    </p>
                )}
            </SectionCard>

            <div className="split">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <SectionCard
                        title="Email Draft"
                        subtitle="Compose the message that will be sent to eligible students."
                        className="workflow-section"
                    >
                        <div className="compose-shell">
                            <div className="compose-topbar">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                                Compose Email
                            </div>

                            <div className="compose-row">
                                <span className="compose-key">To</span>
                                <div className="compose-value">
                                    <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                                        {notification.eligibleCount} eligible student{notification.eligibleCount !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>

                            <div className="compose-row">
                                <span className="compose-key">Subject</span>
                                <div className="compose-value">
                                    <span style={{ color: 'var(--ink)' }}>
                                        Placement Opportunity - {notification.companyName}
                                    </span>
                                </div>
                            </div>

                            <div className="compose-editor-shell">
                                <div className="compose-toolbar">
                                    <div className="compose-tool-group">
                                        <button type="button" className="compose-tool compose-tool-bold" onClick={() => applyFormat('bold')} aria-label="Bold">B</button>
                                        <button type="button" className="compose-tool compose-tool-italic" onClick={() => applyFormat('italic')} aria-label="Italic">I</button>
                                        <button type="button" className="compose-tool compose-tool-underline" onClick={() => applyFormat('underline')} aria-label="Underline">U</button>
                                    </div>
                                    <div className="compose-tool-divider" />
                                    <div className="compose-tool-group">
                                        <button type="button" className="compose-tool" onClick={() => applyFormat('h1')} aria-label="Heading 1">H1</button>
                                        <button type="button" className="compose-tool" onClick={() => applyFormat('h2')} aria-label="Heading 2">H2</button>
                                    </div>
                                    <div className="compose-tool-divider" />
                                    <div className="compose-tool-group">
                                        <button type="button" className="compose-tool" onClick={() => applyFormat('ul')} aria-label="Bullet list">Bullet list</button>
                                        <button type="button" className="compose-tool" onClick={() => applyFormat('ol')} aria-label="Numbered list">Numbered list</button>
                                    </div>
                                </div>

                                <textarea
                                    ref={textareaRef}
                                    className="textarea compose-body"
                                    placeholder={`Dear Student,\n\nWe are pleased to inform you that ${notification.companyName} has opened a new placement opportunity.\n\nRole: [Position]\nPackage: [CTC]\nDeadline: ${deadlineText}\n\nPlease apply through the placement portal.\n\nBest regards,\nPlacement Cell`}
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="compose-footer">
                                <div className="compose-attachments">
                                    <span className="compose-attach-label">
                                        Attachments (optional)
                                    </span>

                                    <div
                                        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={handleDrop}
                                    >
                                        <div className="dropzone-text">
                                            <strong>Click to upload</strong> or drag and drop
                                            <br />
                                            <span style={{ fontSize: '0.78rem' }}>PDF, Excel, Word, images, or archives (max 10MB each)</span>
                                        </div>
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            addFiles(e.target.files);
                                            e.target.value = '';
                                        }}
                                        accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif,.zip,.rar"
                                    />

                                    {attachments.length > 0 && (
                                        <div className="file-chips">
                                            {attachments.map((file, i) => (
                                                <div key={i} className="file-chip">
                                                    {fileIcon(file.name)} {file.name}
                                                    <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                                                        ({formatSize(file.size)})
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="file-chip-remove"
                                                        onClick={() => removeFile(i)}
                                                        title="Remove"
                                                        aria-label="Remove attachment"
                                                    >
                                                        x
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    {notification.eligibleStudents && notification.eligibleStudents.length > 0 && (
                        <SectionCard
                            title={`Eligible Students (${notification.eligibleStudents.length})`}
                            subtitle="Recipients matched by the current eligibility criteria."
                            className="workflow-section"
                        >
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
                                                <td className="mono" style={{ fontSize: '0.85rem' }}>{s.student_id}</td>
                                                <td>{s.full_name}</td>
                                                <td style={{ fontSize: '0.85rem' }}>{s.email}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    )}

                    {notification.criteria && (
                        <SectionCard
                            title="Eligibility Criteria"
                            subtitle="Raw criteria returned by the backend."
                            className="workflow-section"
                        >
                            <pre style={{
                                background: '#f0f4f8',
                                padding: 14,
                                borderRadius: 10,
                                fontSize: '0.85rem',
                                overflow: 'auto',
                                margin: 0,
                                fontFamily: 'var(--font-mono), monospace',
                            }}>
                                {JSON.stringify(notification.criteria, null, 2)}
                            </pre>
                        </SectionCard>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <SectionCard
                        title="Notification Summary"
                        subtitle="Key reference data for this job."
                        className="workflow-section"
                    >
                        <div className="info-grid" style={{ marginBottom: 0 }}>
                            <MetaItem label="Company" value={notification.companyName} />
                            <MetaItem label="Eligible Students" value={notification.eligibleCount} />
                            <MetaItem label="Deadline" value={deadlineText} />
                            <MetaItem
                                label="Status"
                                value={<span className={`pill ${notification.status}`}>{notification.status?.replace('_', ' ')}</span>}
                            />
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Audit Info"
                        subtitle="Operational timestamps and internal notes."
                        className="workflow-section"
                    >
                        <div className="info-grid">
                            {notification.approvedAt && (
                                <MetaItem label="Approved At" value={new Date(notification.approvedAt).toLocaleString()} />
                            )}
                            {notification.rejectedAt && (
                                <MetaItem label="Rejected At" value={new Date(notification.rejectedAt).toLocaleString()} />
                            )}
                            <MetaItem label="Created" value={new Date(notification.createdAt).toLocaleString()} />
                        </div>

                        {notification.adminMessage && (
                            <div style={{ marginTop: 14 }}>
                                <span className="info-label">Internal Note</span>
                                <p style={{ margin: '6px 0 0', color: 'var(--ink)' }}>
                                    {notification.adminMessage}
                                </p>
                            </div>
                        )}
                    </SectionCard>

                    {!isPending && emailBody && (
                        <SectionCard
                            title="Sent Email Body"
                            subtitle="The body that was sent after approval."
                            className="workflow-section"
                        >
                            <pre style={{
                                margin: 0,
                                fontSize: '0.85rem',
                                color: 'var(--ink)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                background: '#f0f4f8',
                                padding: 12,
                                borderRadius: 8,
                                fontFamily: 'inherit',
                            }}>
                                {emailBody}
                            </pre>
                        </SectionCard>
                    )}

                    {!isPending && notification.attachments && notification.attachments.length > 0 && (
                        <SectionCard
                            title="Attachments Sent"
                            subtitle="Files included with the approved notification."
                            className="workflow-section"
                        >
                            <div className="file-chips" style={{ marginTop: 0 }}>
                                {notification.attachments.map((path, i) => (
                                    <div key={i} className="file-chip">
                                        {path.split('/').pop()}
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}
                </div>
            </div>
        </main>
    );
}
