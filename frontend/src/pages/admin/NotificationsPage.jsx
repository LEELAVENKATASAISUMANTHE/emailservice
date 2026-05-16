import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import SectionCard from '../../components/ui/SectionCard';
import MetaItem from '../../components/ui/MetaItem';
import { apiGet } from '../../lib/apiClient';

function StatusPill({ status }) {
  const value = status || 'PENDING_APPROVAL';
  return <span className={`pill ${value}`}>{value.replace(/_/g, ' ')}</span>;
}

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/api/notifications');
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
    pending: rows.filter((r) => !r.status || r.status === 'PENDING_APPROVAL').length,
    approved: rows.filter((r) => r.status === 'APPROVED').length,
    rejected: rows.filter((r) => r.status === 'REJECTED').length,
    sent: rows.filter((r) => r.status === 'SENT').length,
  };

  const pendingRows = rows.filter((r) => !r.status || r.status === 'PENDING_APPROVAL');
  const otherRows = rows.filter((r) => r.status && r.status !== 'PENDING_APPROVAL');
  const orderedRows = [...pendingRows, ...otherRows];

  return (
    <main className="shell">
      <section className="hero">
        <h1>Admin Notifications</h1>
        <p>Review incoming job notifications and move each one through approval or rejection.</p>
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

      <SectionCard
        title="All Notifications"
        subtitle="Pending items are surfaced first so the queue is easier to work through."
        className="workflow-section"
      >
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="row" style={{ gap: 10 }}>
            <MetaItem label="Pending" value={counts.pending} />
            <MetaItem label="Approved" value={counts.approved + counts.sent} />
            <MetaItem label="Rejected" value={counts.rejected} />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && <p className="notice error">{error}</p>}

        {loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
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
                {orderedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">No notifications found.</td>
                  </tr>
                )}
                {orderedRows.map((row) => (
                  <tr key={row.jobId} style={row.status === 'PENDING_APPROVAL' || !row.status ? { background: '#fcf8ef' } : undefined}>
                    <td className="mono">{row.jobId}</td>
                    <td style={{ fontWeight: 600 }}>{row.companyName}</td>
                    <td>{row.eligibleCount}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td>{new Date(row.applicationDeadline).toLocaleDateString()}</td>
                    <td>
                      <Link to={`/admin/notifications/${row.jobId}`} className="btn btn-ghost btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}
