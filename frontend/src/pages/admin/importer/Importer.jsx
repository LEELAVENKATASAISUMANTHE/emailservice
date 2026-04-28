"use client";

import { useState, useEffect, useCallback } from 'react';
import { ReactSpreadsheetImport } from 'react-spreadsheet-import';

// ─── MongoStatus component ───────────────────────────────────────────────────

function MongoStatus() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);

  function refresh() {
    fetch('/api/mongo/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, databases: [] }));
  }

  useEffect(() => { refresh(); }, []);

  const connected = status?.connected;

  return (
    <div className="bg-white rounded-lg border border-gray-200" id="mongo-status">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-medium text-gray-700">MongoDB Status</span>
          {status === null ? (
            <span className="text-xs text-gray-400">Checking…</span>
          ) : (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
          <span className="text-gray-400 text-sm">{open ? '▲ hide' : '▼ show'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-6 py-4 space-y-3">
          {status === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !connected ? (
            <div className="text-sm text-red-600">
              <p className="font-medium">Not connected</p>
              {status.uri && <p className="text-gray-500 mt-1">URI: <code className="bg-gray-100 px-1 rounded">{status.uri}</code></p>}
              {status.error && <p className="text-gray-500 mt-1">Error: {status.error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 space-y-1">
                <p>URI: <code className="bg-gray-100 px-1 rounded text-xs">{status.uri}</code></p>
                <p>Active DB: <code className="bg-green-50 text-green-800 px-1 rounded text-xs font-medium">{status.activeDb}</code></p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Databases ({status.databases.length})</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Size on Disk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {status.databases.map((db) => (
                        <tr key={db.name} className={db.name === status.activeDb ? 'bg-green-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 font-mono text-gray-800">
                            {db.name}
                            {db.name === status.activeDb && (
                              <span className="ml-2 text-green-600 font-medium">(active)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
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

// ─── CredentialsPanel component ─────────────────────────────────────────────

function CredentialsPanel({ importId, showAll = false }) {
  const [entries, setEntries] = useState(null);
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (!importId && !showAll) return;
    const url = showAll
      ? '/api/import/passwords'
      : `/api/import/${importId}/passwords`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setEntries(data);
        if (data.length > 0) setVisible(true);
      })
      .catch(() => setEntries([]));
  }, [importId, showAll]);

  function copy(text, id) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function downloadCredsCsv() {
    const header = showAll
      ? 'import_id,student_id,username,email,password,expires_at'
      : 'student_id,username,email,password,expires_at';
    const lines = entries.map((e) =>
      showAll
        ? [e.importId, e.studentId, e.username, e.email, `"${e.password}"`, e.expiresAt].join(',')
        : [e.studentId, e.username, e.email, `"${e.password}"`, e.expiresAt].join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = showAll ? 'credentials_all.csv' : `credentials_${importId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasEntries = entries && entries.length > 0;

  return (
    <div className="bg-white rounded-lg border border-amber-300">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium text-gray-700">
            {showAll ? 'All Temporary Credentials' : 'Temporary Credentials'}
          </span>
          {entries === null && (
            <span className="text-xs text-gray-400">Loading…</span>
          )}
          {hasEntries && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {entries.length} student{entries.length !== 1 ? 's' : ''} · expires in 24 h
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasEntries && (
            <button onClick={downloadCredsCsv} className="text-xs text-blue-600 hover:text-blue-800 underline">
              Download CSV
            </button>
          )}
          {hasEntries && (
            <button onClick={() => setVisible((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700">
              {visible ? '▲ hide' : '▼ show'}
            </button>
          )}
        </div>
      </div>

      {entries !== null && !hasEntries && (
        <p className="px-6 pb-4 text-sm text-gray-400">
          No credentials found — MongoDB may not be connected, or students already had accounts.
        </p>
      )}

      {hasEntries && visible && (
        <div className="border-t border-amber-100 overflow-x-auto max-h-80">
          <table className="min-w-full text-xs">
            <thead className="bg-amber-50 sticky top-0">
              <tr>
                {(showAll
                  ? ['Import ID', 'Student ID', 'Username', 'Email', 'Password', '']
                  : ['Student ID', 'Username', 'Email', 'Password', '']
                ).map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-50">
              {entries.map((e, i) => (
                <tr key={i} className="hover:bg-amber-50">
                  {showAll && (
                    <td className="px-4 py-2 font-mono text-gray-500">{e.importId}</td>
                  )}
                  <td className="px-4 py-2 font-mono text-gray-700">{e.studentId}</td>
                  <td className="px-4 py-2 text-gray-600">{e.username}</td>
                  <td className="px-4 py-2 text-gray-600">{e.email}</td>
                  <td className="px-4 py-2 font-mono text-gray-800 select-all">{e.password}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => copy(e.password, i)}
                      className="text-blue-500 hover:text-blue-700 text-xs"
                    >
                      {copied === i ? '✓ copied' : 'copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── RowLog component ────────────────────────────────────────────────────────

function RowLog({ importId }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | failed | inserted

  useEffect(() => {
    if (!importId) return;
    fetch(`/api/import/${importId}/log`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setLog)
      .catch(() => setLog(null))
      .finally(() => setLoading(false));
  }, [importId]);

  if (loading) return <p className="text-sm text-gray-500 px-6 py-4">Loading row logs…</p>;
  if (!log) return <p className="text-sm text-gray-400 px-6 py-4">Detailed logs not available (MongoDB may not be connected).</p>;

  const rows = filter === 'all' ? log.rows
    : log.rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 px-6 pt-4 text-sm">
        <span className="text-gray-600">Total: <strong>{log.summary.total}</strong></span>
        <span className="text-green-700">Inserted: <strong>{log.summary.inserted}</strong></span>
        <span className="text-red-600">Failed: <strong>{log.summary.failed}</strong></span>
        {log.minioKey && (
          <span className="text-blue-600 text-xs ml-auto">
            Stored: <code className="bg-blue-50 px-1 rounded">{log.minioKey}</code>
          </span>
        )}
      </div>

      <div className="flex gap-2 px-6">
        {['all', 'inserted', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'failed' && log.summary.failed > 0 && (
              <span className="ml-1 bg-red-500 text-white rounded-full px-1.5">{log.summary.failed}</span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border-t border-gray-100 max-h-80">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-4">No rows in this view.</p>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Row #</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Key / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const keyVal = row.data?.student_id || row.data?.id || Object.values(row.data || {})[0] || '—';
                return (
                  <tr key={row.rowIndex} className={row.status === 'failed' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2 text-gray-500">{row.rowIndex}</td>
                    <td className="px-4 py-2">
                      {row.status === 'inserted' ? (
                        <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                          ✓ Inserted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                          ✗ Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {row.status === 'failed' ? (
                        <span>
                          <span className="text-gray-400 mr-2">{keyVal}</span>
                          <span className="text-red-600">{row.reason}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-gray-600">{keyVal}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Importer component ──────────────────────────────────────────────────────

export default function Importer() {
  const [tables, setTables]           = useState([]);
  const [selectedTable, setSelected]  = useState('');
  const [fields, setFields]           = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState('');
  const [isOpen, setIsOpen]           = useState(false);
  const [result, setResult]           = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [history, setHistory]         = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logOpen, setLogOpen]         = useState(false);
  const [currentImportId, setCurrentImportId] = useState(null);
  const [currentImportTable, setCurrentImportTable] = useState(null);
  const [showAllCreds, setShowAllCreds] = useState(false);

  useEffect(() => {
    fetch('/api/tables')
      .then((r) => r.json())
      .then(setTables)
      .catch((err) => console.error('Failed to load tables', err));
  }, []);

  useEffect(() => {
    if (!selectedTable) { setFields([]); return; }
    setFieldsLoading(true);
    setFieldsError('');
    setResult(null);
    fetch(`/api/schema/${selectedTable}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setFields(data); setFieldsLoading(false); })
      .catch((err) => { setFieldsError(err.message); setFieldsLoading(false); });
  }, [selectedTable]);

  const loadHistory = useCallback(() => {
    fetch('/api/import-history')
      .then((r) => r.json())
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

      const res = await fetch(`/api/import/${selectedTable}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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

  return (
    <div className="space-y-6" id="import">

      <MongoStatus />

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-medium text-gray-700">1. Choose a table</h2>
        <select
          className="block w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={selectedTable}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— select a table —</option>
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {fieldsLoading && <p className="text-sm text-gray-500">Loading schema…</p>}
        {fieldsError && <p className="text-sm text-red-600">Schema error: {fieldsError}</p>}
        {fields.length > 0 && !fieldsLoading && (
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-500">
              {fields.length} column{fields.length !== 1 ? 's' : ''} detected.
            </p>
            <a
              href={`/api/template/${selectedTable}`}
              download
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Download CSV template
            </a>
          </div>
        )}
      </div>

      {selectedTable && fields.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-medium text-gray-700 mb-4">2. Upload spreadsheet</h2>
          <button
            onClick={() => setIsOpen(true)}
            disabled={submitting}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium
                       rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {submitting ? 'Importing…' : `Import into "${selectedTable}"`}
          </button>
        </div>
      )}

      {isOpen && fields.length > 0 && (
        <ReactSpreadsheetImport
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSubmit={handleSubmit}
          fields={fields}
        />
      )}

      {result && !result.error && (
        <div className={`rounded-lg border p-4 ${
          result.failed > 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-green-50 border-green-300'
        }`}>
          <p className={`text-sm font-medium ${result.failed > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
            {result.failed > 0 || result.duplicates > 0
              ? [
                  `${result.inserted} imported`,
                  result.duplicates > 0 ? `${result.duplicates} duplicate${result.duplicates !== 1 ? 's' : ''}` : null,
                  result.failed > 0 ? `${result.failed} failed` : null,
                ].filter(Boolean).join(', ')
              : `${result.inserted} row${result.inserted !== 1 ? 's' : ''} imported successfully`}
          </p>
          {result.failed > 0 && result.errors?.length > 0 && (
            <button
              onClick={() => downloadCsv(result.errors, selectedTable)}
              className="mt-2 text-xs text-yellow-700 underline hover:text-yellow-900"
            >
              Download error report as CSV
            </button>
          )}
        </div>
      )}

      {result?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Import failed: {result.error}</p>
        </div>
      )}

      {currentImportId && currentImportTable === 'students' && (
        <CredentialsPanel importId={currentImportId} />
      )}

      <div className="bg-white rounded-lg border border-gray-200" id="credentials">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left"
          onClick={() => setShowAllCreds((v) => !v)}
        >
          <span className="text-base font-medium text-gray-700">All non-expired credentials</span>
          <span className="text-gray-400 text-sm">{showAllCreds ? '▲ hide' : '▼ show'}</span>
        </button>
        {showAllCreds && (
          <div className="border-t border-gray-100">
            <CredentialsPanel showAll />
          </div>
        )}
      </div>

      {currentImportId && (
        <div className="bg-white rounded-lg border border-gray-200">
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left"
            onClick={() => setLogOpen((v) => !v)}
          >
            <span className="text-base font-medium text-gray-700">Row-level import log</span>
            <span className="text-gray-400 text-sm">{logOpen ? '▲ hide' : '▼ show'}</span>
          </button>
          {logOpen && <RowLog importId={currentImportId} />}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200" id="history">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <span className="text-base font-medium text-gray-700">Import history</span>
          <span className="text-gray-400 text-sm">{historyOpen ? '▲ hide' : '▼ show'}</span>
        </button>

        {historyOpen && (
          <div className="border-t border-gray-100 overflow-x-auto">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 px-6 py-4">No imports yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Table', 'Total', 'Success', 'Failed', 'File', 'Date'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.table_name}</td>
                      <td className="px-4 py-2 text-gray-700">{row.total_rows}</td>
                      <td className="px-4 py-2 text-green-700">{row.success_rows}</td>
                      <td className="px-4 py-2 text-red-600">{row.failed_rows}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-xs">{row.filename || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{formatDate(row.imported_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
