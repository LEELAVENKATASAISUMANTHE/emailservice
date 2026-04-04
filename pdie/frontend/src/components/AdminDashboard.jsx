import { useState } from 'react';
import JobStatus from './JobStatus.jsx';
import StudentsUploadPage from './StudentsUploadPage.jsx';

export default function AdminDashboard() {
  const [jobId, setJobId] = useState('');

  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="dashboard">
          <section className="hero">
            <h1>Student Workbook Intake</h1>
            <p>
              Download the PDIE multi-sheet student template, complete the workbook without changing its structure, upload it, and watch the ingestion job move through validation and insert stages.
            </p>
          </section>

          <div className="dashboard-grid">
            <StudentsUploadPage onJobCreated={setJobId} />
            <JobStatus jobId={jobId} />
          </div>
        </div>
      </main>
    </div>
  );
}
