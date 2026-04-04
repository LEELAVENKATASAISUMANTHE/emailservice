import { useState } from 'react';
import JobStatus from './JobStatus.jsx';
import StudentsUploadPage from './StudentsUploadPage.jsx';
import { StorageMetrics, LiveStream } from './DashboardWidgets.jsx';

export default function AdminDashboard() {
  const [jobId, setJobId] = useState('');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Ingestion Engine
          <span>v2.4.0-stable</span>
        </div>

        <nav className="sidebar-nav">
          <a href="/" className="nav-item active">
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M19 11l-7-7-7 7m14 0v9H5v-9M9 20V12h6v8" /></svg>
            Student Upload
          </a>
          <a href="#" className="nav-item">
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Upload Workbook
          </a>
          <a href="#" className="nav-item">
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Job Status
          </a>
          <button className="new-project-btn">
            + New Project
          </button>
        </nav>

        <div className="sidebar-bottom">
          <a href="#" className="nav-item">
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Settings
          </a>
          <a href="#" className="nav-item">
            <svg className="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </a>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="top-nav">
            <a href="/" style={{ color: 'var(--text-main)' }}>CONTROL PLANE</a>
            <a href="#">Docs</a>
            <a href="#">Support</a>
          </div>
          <div className="top-actions">
            <button className="icon-btn">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            </button>
            <button className="icon-btn">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <div className="profile-pic">A</div>
          </div>
        </header>

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

          <div className="bottom-grid">
            <StorageMetrics />
            <LiveStream />
          </div>
        </div>
      </main>
    </div>
  );
}
