import { useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

export default function TablePicker({ template, onTemplateCreated }) {
  const [tables, setTables] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadTables = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/api/tables`);
        const data = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load tables');
        }

        if (!cancelled) {
          setTables(Array.isArray(data) ? data : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTables();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSelection = (tableName) => {
    setSelectedTables((current) =>
      current.includes(tableName)
        ? current.filter((value) => value !== tableName)
        : [...current, tableName]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: selectedTables })
      });

      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate template');
      }

      onTemplateCreated(data);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!template?.templateId) {
      return;
    }

    setError('');

    try {
      const response = await fetch(`${apiBase}/api/templates/${template.templateId}/download`);
      if (!response.ok) {
        const data = await parseJsonResponse(response);
        throw new Error(data.error || 'Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${template.tables.join('_')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Template Builder</h2>
        </div>
        {template?.templateId ? (
          <button className="secondary-button" type="button" onClick={handleDownload}>
            Download Template
          </button>
        ) : null}
      </div>

      <p className="panel-copy">
        Select one or more placement tables. PDIE introspects the live PostgreSQL schema and
        generates a deterministic Excel template with hidden metadata.
      </p>

      {error ? <div className="message error">{error}</div> : null}

      <form className="stack" onSubmit={handleSubmit}>
        <div className="table-list">
          {loading ? <p className="muted">Loading tables...</p> : null}
          {!loading && !tables.length ? <p className="muted">No ingestable tables were found.</p> : null}
          {tables.map((table) => (
            <label className="table-option" key={table.table_name}>
              <input
                type="checkbox"
                checked={selectedTables.includes(table.table_name)}
                onChange={() => toggleSelection(table.table_name)}
              />
              <span className="table-label">{table.table_name}</span>
              <span className="table-badge">{table.column_count} cols</span>
            </label>
          ))}
        </div>

        <button className="primary-button" type="submit" disabled={submitting || !selectedTables.length}>
          {submitting ? 'Generating...' : 'Generate Template'}
        </button>
      </form>

      {template?.templateId ? (
        <div className="summary-card">
          <p className="summary-title">{template.templateId}</p>
          <p className="muted">Tables: {template.tables.join(', ')}</p>
          <p className="muted">Join keys: {template.joinKeys.length ? template.joinKeys.join(', ') : 'None'}</p>
          <p className="muted">Headers: {template.headerMap.length}</p>
        </div>
      ) : null}
    </section>
  );
}
