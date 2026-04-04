import { useRef, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

export default function StudentsUploadPage({ onJobCreated }) {
  const [file, setFile] = useState(null);
  const [templateInfo, setTemplateInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${apiBase}/api/students/template/full`);
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load student template');
      }

      const downloadUrl = `${apiBase}${data.downloadUrl}`;
      setTemplateInfo(data);
      setMessage('Student template ready. Download started in a new tab.');
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleChooseFile = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setError('');
    setMessage(selectedFile ? 'Workbook selected. Ready to upload.' : '');
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Select a completed student workbook first');
      return;
    }

    setUploading(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/api/students/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Student upload failed');
      }

      const nextJobId = data.jobId || data.job_id || '';
      onJobCreated(nextJobId);
      setMessage(nextJobId
        ? `Upload accepted. Tracking job ${nextJobId}.`
        : 'Upload accepted.');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="panel students-upload-page">
      <div className="panel-subtitle">Student Intake Flow</div>
      <div className="panel-title students-upload-header">
        <div>
          <h2>Upload Students</h2>
          <p className="students-upload-copy">
            Download the generated workbook, fill the student sheets, upload the file, and track the ingestion job from the same screen.
          </p>
        </div>
        <div className="students-upload-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleDownloadTemplate}
            disabled={downloading}
          >
            {downloading ? 'Preparing...' : 'Download Template'}
          </button>
        </div>
      </div>

      <div className="students-upload-grid">
        <div className="students-upload-card">
          <div className="section-label">Workbook Rules</div>
          <ul className="instruction-list">
            <li>Fill `student_ref` correctly for every row you add.</li>
            <li>Do not rename or reorder workbook sheet names.</li>
            <li>Leave unused sheets empty instead of deleting them.</li>
          </ul>

          {templateInfo?.sheetNames?.length ? (
            <div className="template-meta">
              <div className="section-label">Included Sheets</div>
              <div className="sheet-badges">
                {templateInfo.sheetNames.map((sheetName) => (
                  <span key={sheetName} className="sheet-badge">{sheetName}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="students-upload-card students-upload-form">
          <div className="section-label">Upload Workbook</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="file-picker"
            onClick={handleChooseFile}
            disabled={uploading}
          >
            <span className="file-picker-label">Select File</span>
            <span className="file-picker-value">{file?.name || 'No workbook selected'}</span>
          </button>

          <button
            type="button"
            className="btn-primary upload-submit"
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? 'Uploading...' : 'Upload Workbook'}
          </button>

          {message ? <p className="upload-feedback upload-feedback-success">{message}</p> : null}
          {error ? <p className="upload-feedback upload-feedback-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
