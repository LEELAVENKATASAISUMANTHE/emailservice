import { useState } from 'react';
import TablePicker from './components/TablePicker.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import JobStatus from './components/JobStatus.jsx';

export default function App() {
  const [template, setTemplate] = useState(null);
  const [jobId, setJobId] = useState('');

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="hero">
          <p className="eyebrow">Placement Data Ingestion Engine</p>
          <h1>Excel Ingestion Control Plane</h1>
          <p className="hero-copy">
            Generate schema-aware templates, upload completed workbooks, and poll ingestion status
            entirely over HTTP.
          </p>
        </header>

        <div className="grid-layout">
          <TablePicker template={template} onTemplateCreated={setTemplate} />
          <UploadPanel onJobCreated={setJobId} />
        </div>

        <JobStatus jobId={jobId} />
      </div>
    </main>
  );
}
