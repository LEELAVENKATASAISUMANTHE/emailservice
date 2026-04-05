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
  const [selectedFields, setSelectedFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadTables = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/api/templates/tables`);
        const data = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load tables');
        }

        if (!cancelled) {
          setTables(Array.isArray(data.tables) ? data.tables : []);
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

  const toggleFieldSelection = (tableName, fieldName) => {
    const fieldKey = `${tableName}.${fieldName}`;

    setSelectedFields((current) =>
      current.includes(fieldKey)
        ? current.filter((value) => value !== fieldKey)
        : [...current, fieldKey]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const selectedTables = [...new Set(selectedFields.map((value) => value.split('.')[0]))];
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
            <div className="table-field-group" key={table.name}>
              <h3 className="table-group-title">{table.name}</h3>
              <div className="table-field-list">
                {table.fields.map((field) => {
                  const fieldKey = `${table.name}.${field}`;

                  return (
                    <label className="table-option" key={fieldKey}>
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(fieldKey)}
                        onChange={() => toggleFieldSelection(table.name, field)}
                      />
                      <span>{field}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          
          <button 
            type="submit" 
            className="btn-secondary" 
            disabled={submitting || !selectedFields.length}
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
          <div className="section-label" style={{ marginBottom: '12px' }}>Selected Fields</div>
          <div className="schema-preview">
            {!selectedFields.length && <div>No fields selected...</div>}
            {selectedFields.map((fieldKey) => (
              <div className="schema-row" key={fieldKey}>
                <span>{fieldKey}</span>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
