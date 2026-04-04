import { useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

export default function JobStatus({ jobId }) {
  const [activeJob, setActiveJob] = useState(null);

  useEffect(() => {
    if (!jobId) {
      setActiveJob(null);
      return undefined;
    }

    let active = true;
    let intervalId;

    const fetchJob = async () => {
      try {
        const response = await fetch(`${apiBase}/api/jobs/${jobId}`);
        const data = await parseJsonResponse(response);

        if (response.ok && active) {
          setActiveJob(data);
        }

        if (data.status === 'done' || data.status === 'failed') {
          window.clearInterval(intervalId);
        }
      } catch (err) {
        // ignore
      }
    };

    fetchJob();
    intervalId = window.setInterval(fetchJob, 2000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [jobId]);

  return (
    <div className="panel jobs-panel">
      <div className="jobs-header">
        <h2>Student Upload Job</h2>
      </div>

      <table className="jobs-table">
        <thead>
          <tr>
            <th>Job Reference</th>
            <th>Process Type</th>
            <th>Health</th>
            <th>Queue Depth</th>
            <th>Committed</th>
            <th>Rejected</th>
          </tr>
        </thead>
        <tbody>
          {activeJob && (
            <tr>
              <td className="job-ref">{activeJob.jobId || jobId}</td>
              <td>Student workbook</td>
              <td>
                <div className="job-health">
                  <div className={`status-indicator ${activeJob.status === 'done' ? 'idle' : activeJob.status === 'failed' ? 'failure' : 'executing'}`}></div>
                  {activeJob.status.toUpperCase()}
                </div>
              </td>
              <td className="job-ref">{activeJob.totalRows ? `${activeJob.totalRows} Rows` : '---'}</td>
              <td className="execution-time">{activeJob.committedRows ?? 0}</td>
              <td className="execution-time">{activeJob.rejectedRows ?? 0}</td>
            </tr>
          )}
          {!activeJob && (
             <tr>
               <td colSpan="5" className="jobs-empty-state">
                 Upload a student workbook to start tracking a real ingestion job.
               </td>
             </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
