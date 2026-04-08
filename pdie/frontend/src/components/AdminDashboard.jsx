import { useState } from 'react';
import { Link } from 'react-router-dom';
import JobStatus from './JobStatus.jsx';
import StudentsUploadPage from './StudentsUploadPage.jsx';
import TablePicker from './TablePicker.jsx';

export default function AdminDashboard() {
  const [jobId, setJobId] = useState('');
  const [template, setTemplate] = useState(null);

  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="dashboard">
          <section className="hero">
            <div className="hero-actions">
              <div>
                <h1>Student Workbook Intake</h1>
                <p>
                  Download the PDIE multi-sheet student template, complete the workbook without changing its structure, upload it, and watch the ingestion job move through validation and insert stages.
                </p>
              </div>
              <Link to="/students" className="btn-secondary page-link">View Students</Link>
            </div>
          </section>

          <div className="dashboard-grid">
            <TablePicker template={template} onTemplateCreated={setTemplate} />
            <StudentsUploadPage onJobCreated={setJobId} />
            <JobStatus jobId={jobId} />
          </div>
        </div>
      </main>
    </div>
  );
}
