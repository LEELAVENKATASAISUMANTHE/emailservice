import { useEffect, useMemo, useRef, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

export default function JobStatus({ jobId }) {
  const [job, setJob] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const reportRequested = useRef(false);

  useEffect(() => {
    setJob(null);
    setReport(null);
    setError('');
    reportRequested.current = false;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      return undefined;
    }

    let active = true;
    let intervalId;

    const fetchJob = async () => {
      try {
        const response = await fetch(`${apiBase}/api/jobs/${jobId}`);
        const data = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load job');
        }

        if (!active) {
          return;
        }

        setJob(data);

        if ((data.status === 'done' || data.status === 'failed') && !reportRequested.current) {
          reportRequested.current = true;
          const reportResponse = await fetch(`${apiBase}/api/jobs/${jobId}/report`);
          const reportData = await parseJsonResponse(reportResponse);

          if (!reportResponse.ok) {
            throw new Error(reportData.error || 'Failed to load job report');
          }

          if (active) {
            setReport(reportData);
          }
        }

        if (data.status === 'done' || data.status === 'failed') {
          window.clearInterval(intervalId);
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError.message);
        }
      }
    };

    fetchJob();
    intervalId = window.setInterval(fetchJob, 2000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [jobId]);

  const progress = useMemo(() => {
    if (!job?.totalRows) {
      return 0;
    }

    return Math.min(100, Math.round((job.processedRows / job.totalRows) * 100));
  }, [job]);

  const errorRows = useMemo(() => {
    if (!report?.rows?.length) {
      return [];
    }

    return report.rows
      .filter((row) => row.status === 'error')
      .flatMap((row) =>
        (row.errors || []).map((errorItem) => ({
          rowIndex: row.rowIndex,
          field: errorItem.field,
          value: errorItem.value,
          message: errorItem.message
        }))
      );
  }, [report]);

  if (!jobId) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Step 3</p>
            <h2>Job Status</h2>
          </div>
        </div>
        <p className="muted">Upload a workbook to start polling job progress.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Step 3</p>
          <h2>Job Status</h2>
        </div>
        {job ? <span className={`status-badge status-${job.status}`}>{job.status}</span> : null}
      </div>

      {error ? <div className="message error">{error}</div> : null}

      <div className="summary-card">
        <p className="summary-title">{jobId}</p>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="metrics-grid">
          <div>
            <span className="metric-label">Progress</span>
            <strong>{progress}%</strong>
          </div>
          <div>
            <span className="metric-label">Processed</span>
            <strong>{job?.processedRows ?? 0}</strong>
          </div>
          <div>
            <span className="metric-label">Committed</span>
            <strong>{job?.committedRows ?? 0}</strong>
          </div>
          <div>
            <span className="metric-label">Rejected</span>
            <strong>{job?.rejectedRows ?? 0}</strong>
          </div>
        </div>
        {job?.errorSummary ? <p className="message error">{job.errorSummary}</p> : null}
      </div>

      {(job?.status === 'done' || job?.status === 'failed') && report ? (
        <div className="report-block">
          <h3>Row-Level Report</h3>
          {!errorRows.length ? <p className="muted">No row errors were recorded.</p> : null}
          {errorRows.length ? (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Field</th>
                    <th>Value</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((row, index) => (
                    <tr key={`${row.rowIndex}-${row.field}-${index}`}>
                      <td>{row.rowIndex}</td>
                      <td>{row.field || '-'}</td>
                      <td>{row.value || '-'}</td>
                      <td>{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
