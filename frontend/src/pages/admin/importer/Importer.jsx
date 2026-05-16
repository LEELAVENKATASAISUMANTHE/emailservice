import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import SectionCard from '../../../components/ui/SectionCard';
import MetaItem from '../../../components/ui/MetaItem';
import { apiGet, apiPostForm, apiUrl } from '../../../lib/apiClient';

const ReactSpreadsheetImport = lazy(() => (
  import('react-spreadsheet-import').then((module) => ({
    default: module.ReactSpreadsheetImport,
  }))
));

function MongoStatus() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);

  function refresh() {
    apiGet('/api/mongo/status')
      .then(setStatus)
      .catch(() => setStatus({ connected: false, databases: [] }));
  }

  useEffect(() => { refresh(); }, []);

  const connected = status?.connected;

  return (
    <SectionCard
      title="MongoDB status"
      subtitle="Check the source connection before starting an import."
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide details' : 'Show details'}
        </button>

        <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
          {status === null ? (
            <span className="muted">Checking...</span>
          ) : (
            <span className={`pill ${connected ? 'APPROVED' : 'REJECTED'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          )}
          <button type="button" onClick={refresh} className="btn btn-ghost btn-sm">
            Refresh
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {status === null ? (
            <p className="muted" style={{ margin: 0 }}>Loading...</p>
          ) : !connected ? (
            <div className="notice error" style={{ marginTop: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Not connected</div>
              {status.uri && <div>URI: <code>{status.uri}</code></div>}
              {status.error && <div style={{ marginTop: 4 }}>Error: {status.error}</div>}
            </div>
          ) : (
            <div className="info-grid">
              <MetaItem label="URI" value={<span className="mono" style={{ fontSize: '0.92rem' }}>{status.uri}</span>} />
              <MetaItem label="Active DB" value={<span className="pill APPROVED">{status.activeDb}</span>} />
              <MetaItem label="Databases" value={status.databases.length} />
            </div>
          )}

          {connected && Array.isArray(status.databases) && status.databases.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Database list
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Size on Disk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.databases.map((db) => (
                      <tr key={db.name} style={db.name === status.activeDb ? { background: '#f2fbf6' } : undefined}>
                        <td className="mono">
                          {db.name}
                          {db.name === status.activeDb && <span className="muted" style={{ marginLeft: 8 }}>(active)</span>}
                        </td>
                        <td>
                          {db.sizeOnDisk >= 1024 * 1024
                            ? `${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`
                            : `${(db.sizeOnDisk / 1024).toFixed(1)} KB`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function downloadCsv(errors, tableName) {
  if (!errors.length) return;
  const headers = ['Row', 'Error', ...Object.keys(errors[0].rowData)];
  const lines = errors.map((e) => {
    const values = [e.rowIndex, `"${e.error.replace(/"/g, '""')}"`,
      ...Object.values(e.rowData).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`),
    ];
    return values.join(',');
  });
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tableName}_import_errors.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CredentialsPanel({ importId, showAll = false }) {
  const [entries, setEntries] = useState(null);
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState(() => new Set());
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (!importId && !showAll) return;
    setVisible(false);
    setRevealed(new Set());
    setCopied(null);
    const url = showAll
      ? '/api/import/passwords'
      : `/api/import/${encodeURIComponent(importId)}/passwords`;
    apiGet(url)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [importId, showAll]);

  function copy(text, id) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function toggleReveal(id) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const hasEntries = entries && entries.length > 0;

  return (
    <SectionCard
      title={showAll ? 'All non-expired credentials' : 'Temporary credentials'}
      subtitle={showAll ? 'Inspect all active student credentials.' : 'Credentials generated by the latest student import.'}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 10 }}>
          {entries === null && <span className="muted">Loading...</span>}
          {hasEntries && <span className="pill APPROVED">{entries.length} student{entries.length !== 1 ? 's' : ''}</span>}
        </div>
        <div className="row" style={{ gap: 10 }}>
          {hasEntries && (
            <button type="button" onClick={() => setVisible((v) => !v)} className="btn btn-ghost btn-sm">
              {visible ? 'Hide table' : 'Review credentials'}
            </button>
          )}
        </div>
      </div>

      {hasEntries && !visible && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Passwords are hidden by default. Open the table only when credentials need to be handed to a student.
        </p>
      )}

      {entries !== null && !hasEntries && (
        <p className="muted" style={{ marginBottom: 0 }}>
          No credentials found. MongoDB may not be connected, or the imported students already had accounts.
        </p>
      )}

      {hasEntries && visible && (
        <div className="table-wrap" style={{ marginTop: 14, maxHeight: 320 }}>
          <table className="table">
            <thead>
              <tr>
                {(showAll
                  ? ['Import ID', 'Student ID', 'Username', 'Email', 'Password', 'Actions']
                  : ['Student ID', 'Username', 'Email', 'Password', 'Actions']
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const rowId = `${e.importId || importId || 'all'}-${e.studentId || i}`;
                const isRevealed = revealed.has(rowId);

                return (
                  <tr key={rowId}>
                    {showAll && <td className="mono">{e.importId}</td>}
                    <td className="mono">{e.studentId}</td>
                    <td>{e.username}</td>
                    <td>{e.email}</td>
                    <td className="mono">
                      {isRevealed ? e.password : '************'}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <button type="button" onClick={() => toggleReveal(rowId)} className="btn btn-ghost btn-sm">
                          {isRevealed ? 'Mask' : 'Reveal'}
                        </button>
                        {isRevealed && (
                          <button type="button" onClick={() => copy(e.password, rowId)} className="btn btn-ghost btn-sm">
                            {copied === rowId ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function RowLog({ importId }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!importId) return;
    apiGet(`/api/import/${encodeURIComponent(importId)}/log`)
      .then(setLog)
      .catch(() => setLog(null))
      .finally(() => setLoading(false));
  }, [importId]);

  if (loading) {
    return (
      <SectionCard title="Row-level import log" subtitle="Detailed row outcome from the latest import.">
        <p className="muted" style={{ margin: 0 }}>Loading row logs...</p>
      </SectionCard>
    );
  }

  if (!log) {
    return (
      <SectionCard title="Row-level import log" subtitle="Detailed row outcome from the latest import.">
        <p className="muted" style={{ margin: 0 }}>Detailed logs not available. MongoDB may not be connected.</p>
      </SectionCard>
    );
  }

  const rows = filter === 'all' ? log.rows : log.rows.filter((r) => r.status === filter);

  return (
    <SectionCard
      title="Row-level import log"
      subtitle="Detailed row outcome from the latest import."
    >
      <div className="info-grid" style={{ marginBottom: 14 }}>
        <MetaItem label="Total" value={log.summary.total} />
        <MetaItem label="Inserted" value={log.summary.inserted} />
        <MetaItem label="Failed" value={log.summary.failed} />
        {log.minioKey && <MetaItem label="Stored" value={<span className="mono">{log.minioKey}</span>} />}
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        {['all', 'inserted', 'failed'].map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'failed' && log.summary.failed > 0 && <span style={{ marginLeft: 6 }}>({log.summary.failed})</span>}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No rows in this view.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Row #</th>
                <th>Status</th>
                <th>Key / Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const keyVal = row.data?.student_id || row.data?.id || Object.values(row.data || {})[0] || '-';
                return (
                  <tr key={row.rowIndex} style={row.status === 'failed' ? { background: '#fff5f5' } : undefined}>
                    <td className="mono">{row.rowIndex}</td>
                    <td>
                      {row.status === 'inserted' ? (
                        <span className="pill APPROVED">Inserted</span>
                      ) : (
                        <span className="pill REJECTED">Failed</span>
                      )}
                    </td>
                    <td>
                      {row.status === 'failed' ? (
                        <span>
                          <span className="mono muted" style={{ marginRight: 8 }}>{keyVal}</span>
                          <span className="text-red-600">{row.reason}</span>
                        </span>
                      ) : (
                        <span className="mono">{keyVal}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export default function Importer() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelected] = useState('');
  const [fields, setFields] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [currentImportId, setCurrentImportId] = useState(null);
  const [currentImportTable, setCurrentImportTable] = useState(null);
  const [showAllCreds, setShowAllCreds] = useState(false);

  useEffect(() => {
    apiGet('/api/tables')
      .then(setTables)
      .catch((err) => console.error('Failed to load tables', err));
  }, []);

  useEffect(() => {
    if (!selectedTable) {
      setFields([]);
      return;
    }
    setFieldsLoading(true);
    setFieldsError('');
    setResult(null);
    apiGet(`/api/schema/${encodeURIComponent(selectedTable)}`)
      .then((data) => {
        setFields(data);
        setFieldsLoading(false);
      })
      .catch((err) => {
        setFieldsError(err.message);
        setFieldsLoading(false);
      });
  }, [selectedTable]);

  const loadHistory = useCallback(() => {
    apiGet('/api/import-history')
      .then(setHistory)
      .catch((err) => console.error('Failed to load history', err));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleSubmit({ validData, invalidData, all, file }) {
    setIsOpen(false);
    setSubmitting(true);
    setResult(null);
    setCurrentImportId(null);
    setLogOpen(false);

    try {
      const rowsToImport = (all && all.length > 0) ? all : [...(validData || []), ...(invalidData || [])];
      const formData = new FormData();
      if (file) formData.append('file', file);
      formData.append('rows', JSON.stringify(rowsToImport));
      formData.append('filename', file?.name || '');

      const data = await apiPostForm(`/api/import/${encodeURIComponent(selectedTable)}`, formData);
      setResult(data);
      if (data.importId) {
        setCurrentImportId(data.importId);
        setCurrentImportTable(selectedTable);
        setLogOpen(true);
      }
      loadHistory();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const hasTable = selectedTable && fields.length > 0;

  return (
    <div className="space-y-6" id="import">
      <MongoStatus />

      <SectionCard
        title="1. Choose a table"
        subtitle="Select the target table and generate a matching import schema."
      >
        <div className="row" style={{ alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label className="label">Target table</label>
            <select
              className="input"
              value={selectedTable}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a table</option>
              {tables.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 220 }}>
            <label className="label">Schema status</label>
            {fieldsLoading && <p className="muted" style={{ margin: 0 }}>Loading schema...</p>}
            {fieldsError && <p className="notice error" style={{ margin: 0 }}>Schema error: {fieldsError}</p>}
            {fields.length > 0 && !fieldsLoading && !fieldsError && (
              <div className="info-grid">
                <MetaItem label="Columns" value={fields.length} />
                <MetaItem
                  label="Template"
                  value={(
                    <a
                      href={apiUrl(`/api/template/${encodeURIComponent(selectedTable)}`)}
                      download
                      className="btn btn-ghost btn-sm"
                    >
                      Download CSV template
                    </a>
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="2. Upload spreadsheet"
        subtitle={hasTable ? 'Run the import for the selected table.' : 'Choose a table first to enable the importer.'}
      >
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="muted">
            {selectedTable ? (
              <span>
                Target: <span className="mono">{selectedTable}</span>
              </span>
            ) : (
              'No table selected.'
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={submitting || !hasTable}
            className="btn btn-primary"
          >
            {submitting ? 'Importing...' : 'Open import dialog'}
          </button>
        </div>

        {!hasTable && (
          <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
            The import dialog becomes available after the schema loads.
          </p>
        )}
      </SectionCard>

      {isOpen && fields.length > 0 && (
        <Suspense fallback={null}>
          <ReactSpreadsheetImport
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onSubmit={handleSubmit}
            fields={fields}
          />
        </Suspense>
      )}

      {result && !result.error && (
        <SectionCard
          title="Import result"
          subtitle="Summary of the most recent import."
        >
          <div className="info-grid" style={{ marginBottom: 14 }}>
            <MetaItem label="Inserted" value={result.inserted} />
            <MetaItem label="Failed" value={result.failed} />
            <MetaItem label="Duplicates" value={result.duplicates || 0} />
            {result.importId && <MetaItem label="Import ID" value={<span className="mono">{result.importId}</span>} />}
          </div>

          <div className={`notice ${result.failed > 0 ? 'error' : 'ok'}`} style={{ marginTop: 0 }}>
            {result.failed > 0 || result.duplicates > 0
              ? [
                `${result.inserted} imported`,
                result.duplicates > 0 ? `${result.duplicates} duplicate${result.duplicates !== 1 ? 's' : ''}` : null,
                result.failed > 0 ? `${result.failed} failed` : null,
              ].filter(Boolean).join(', ')
              : `${result.inserted} row${result.inserted !== 1 ? 's' : ''} imported successfully`}
          </div>

          {result.failed > 0 && result.errors?.length > 0 && (
            <button
              type="button"
              onClick={() => downloadCsv(result.errors, selectedTable)}
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12 }}
            >
              Download error report
            </button>
          )}
        </SectionCard>
      )}

      {result?.error && (
        <SectionCard
          title="Import failed"
          subtitle="The import did not complete."
        >
          <div className="notice error" style={{ marginTop: 0, marginBottom: 0 }}>
            {result.error}
          </div>
        </SectionCard>
      )}

      {currentImportId && currentImportTable === 'students' && (
        <CredentialsPanel importId={currentImportId} />
      )}

      <SectionCard
        title="All non-expired credentials"
        subtitle="Secondary inspection area for active temporary credentials."
      >
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>
            Expand only when you need to inspect active credentials.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAllCreds((v) => !v)}
          >
            {showAllCreds ? 'Hide' : 'Show'}
          </button>
        </div>
        {showAllCreds && (
          <div style={{ marginTop: 14 }}>
            <CredentialsPanel showAll />
          </div>
        )}
      </SectionCard>

      {currentImportId && (
        <SectionCard
          title="Row-level import log"
          subtitle="Inspect row-by-row outcomes if the import produced partial failures."
        >
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              Detailed row status is available for the latest import.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setLogOpen((v) => !v)}
            >
              {logOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {logOpen && <div style={{ marginTop: 14 }}><RowLog importId={currentImportId} /></div>}
        </SectionCard>
      )}

      <SectionCard
        title="Import history"
        subtitle="Operational history for recent imports."
      >
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>
            Review past imports when needed. This is kept secondary to the active workflow.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? 'Hide' : 'Show'}
          </button>
        </div>

        {historyOpen && (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            {history.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No imports yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    {['Table', 'Total', 'Success', 'Failed', 'File', 'Date'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{row.table_name}</td>
                      <td>{row.total_rows}</td>
                      <td style={{ color: 'var(--good)' }}>{row.success_rows}</td>
                      <td style={{ color: 'var(--bad)' }}>{row.failed_rows}</td>
                      <td className="muted">{row.filename || '-'}</td>
                      <td className="muted">{formatDate(row.imported_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
