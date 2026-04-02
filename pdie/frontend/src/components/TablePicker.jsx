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
    <div className="panel">
      <div className="panel-subtitle">Configuration Module</div>
      <div className="panel-title">
        <h2>Template Builder</h2>
        <div className="db-badges">
          <span className="db-badge">POSTGRESQL</span>
          <span className="db-badge">V4.2 SCHEMA</span>
        </div>
      </div>

      {error ? <div style={{ color: 'red', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div> : null}

      <form className="template-builder" onSubmit={handleSubmit}>
        <div className="source-selection">
          <div className="section-label">Source Selection</div>
          {loading ? <p>Loading...</p> : null}
          {!loading && tables.map((table) => (
            <label className="table-option" key={table.table_name}>
              <input
                type="checkbox"
                checked={selectedTables.includes(table.table_name)}
                onChange={() => toggleSelection(table.table_name)}
              />
              <span>{table.table_name}</span>
            </label>
          ))}
          
          <button 
            type="submit" 
            className="btn-secondary" 
            disabled={submitting || !selectedTables.length}
            style={{ width: 'fit-content', marginTop: '16px' }}
          >
            {submitting ? 'Generating...' : 'Generate Target'}
          </button>
          
          {template?.templateId && (
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleDownload}
              style={{ width: 'fit-content', marginTop: '8px' }}
            >
              Download .xlsx
            </button>
          )}
        </div>

        <div className="schema-preview-container">
          <div className="section-label" style={{ marginBottom: '12px' }}>Schema Preview</div>
          <div className="schema-preview">
            {!selectedTables.length && <div>No table selected...</div>}
            {selectedTables.includes('Master_Financial_Ledger_2024') || selectedTables.length > 0 ? (
               <>
                 <div className="schema-row"><span>col_uuid</span> <span className="type">UUID</span></div>
                 <div className="schema-row"><span>timestamp_utc</span> <span className="type">TIMESTAMP</span></div>
                 <div className="schema-row"><span>amount_decimal</span> <span className="type">NUMERIC</span></div>
                 <div className="schema-row"><span>entity_ref_id</span> <span className="type">VARCHAR</span></div>
                 <div className="schema-row"><span>status_code</span> <span className="type">INT4</span></div>
               </>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
