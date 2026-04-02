import { useState, useRef } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

export default function UploadPanel({ onJobCreated }) {
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    setMessage('');
    setUploadProgress(0);
    const selected = event.target.files?.[0];
    if (selected) {
      setFile(selected);
      handleUpload(selected);
    }
  };

  const handleUpload = async (fileToUpload) => {
    setSubmitting(true);
    setUploadProgress(10);
    
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetch(`${apiBase}/api/uploads`, {
        method: 'POST',
        body: formData
      });

      setUploadProgress(50);
      const data = await parseJsonResponse(response);
      setUploadProgress(100);

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onJobCreated(data.jobId);
      setTimeout(() => {
        setUploadProgress(0);
        setFile(null);
      }, 3000);
    } catch (uploadError) {
      setMessage(uploadError.message);
      setUploadProgress(0);
      setFile(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClick = () => {
    if (!submitting) fileInputRef.current.click();
  };

  return (
    <div className="panel upload-panel">
      <div className="panel-subtitle">File Pipeline</div>
      <div className="panel-title" style={{ marginBottom: 0 }}>
        <h2>Upload Workbook</h2>
      </div>

      <input 
        type="file" 
        accept=".xlsx,.csv,.xlsm"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <div className="drop-zone" onClick={handleClick}>
        <svg className="drop-zone-icon" width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        <h3>DRAG & DROP</h3>
        <p>XLSX, CSV, or XLSM formats only. Max 500MB.</p>
        
        {message && <p style={{ color: '#FCA5A5', marginTop: '16px' }}>{message}</p>}
      </div>

      {submitting && (
         <div className="file-status">
            <div className="file-status-info">
               <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               {file.name}
            </div>
            <span>{uploadProgress}%</span>
         </div>
      )}
      
      {!submitting && file && (
         <div className="file-status">
            <div className="file-status-info">
               <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               {file.name}
            </div>
            <span>Processing...</span>
         </div>
      )}
    </div>
  );
}
