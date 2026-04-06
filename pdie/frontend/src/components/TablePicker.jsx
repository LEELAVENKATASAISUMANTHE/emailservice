import { useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function getDownloadFilename(response, fallbackName) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);

  return match?.[1] || fallbackName;
}

export default function TablePicker({ template, onTemplateCreated }) {
  const [tables, setTables] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
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

  const downloadTemplateFile = async (templateData) => {
    if (!templateData?.templateId) {
      throw new Error('Template download is not available');
    }

    const response = await fetch(`${apiBase}/api/templates/${templateData.templateId}/download`);
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      throw new Error(data.error || 'Failed to download template');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fallbackName = `template_${(templateData.tables || []).join('_') || 'download'}.xlsx`;

    link.href = url;
    link.download = getDownloadFilename(response, fallbackName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: selectedFields })
      });

      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate template');
      }

      onTemplateCreated(data);
      await downloadTemplateFile(data);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    setError('');
    try {
      await downloadTemplateFile(template);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Select an Excel file first');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/api/templates/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload Excel');
      }

      setParsedData(data);
      console.log('Parsed Excel data:', data);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
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
            {submitting ? 'Generating...' : 'Generate Template'}
          </button>
          
          {template?.templateId && (
            <>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleDownload}
                style={{ width: 'fit-content', marginTop: '8px' }}
              >
                Download .xlsx
              </button>

              <div style={{ marginTop: '16px' }}>
                <div className="section-label" style={{ marginBottom: '8px' }}>Upload Filled Excel</div>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setParsedData(null);
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{ width: 'fit-content', marginTop: '8px' }}
                >
                  {uploading ? 'Uploading...' : 'Upload Excel'}
                </button>
              </div>
            </>
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

          {parsedData && (
            <>
              <div className="section-label" style={{ marginTop: '16px', marginBottom: '12px' }}>Parsed Upload Result</div>
              <div style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
                Total: {parsedData.total ?? 0} | Valid: {parsedData.validCount ?? 0} | Invalid: {parsedData.invalidCount ?? 0} | Inserted: {parsedData.insertedCount ?? 0}
              </div>

              {parsedData?.invalidRows?.length > 0 && (
                <>
                  <div className="section-label" style={{ marginBottom: '12px' }}>Validation Errors</div>
                  <pre
                    style={{
                      margin: '0 0 12px 0',
                      padding: '12px',
                      overflow: 'auto',
                      borderRadius: '12px',
                      background: 'rgba(127, 29, 29, 0.95)',
                      color: '#fee2e2',
                      fontSize: '0.78rem',
                      lineHeight: 1.5,
                      maxHeight: '220px'
                    }}
                  >
                    {JSON.stringify(parsedData.invalidRows, null, 2)}
                  </pre>
                </>
              )}

              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  overflow: 'auto',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#e2e8f0',
                  fontSize: '0.78rem',
                  lineHeight: 1.5,
                  maxHeight: '320px'
                }}
              >
                {JSON.stringify(parsedData, null, 2)}
              </pre>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
