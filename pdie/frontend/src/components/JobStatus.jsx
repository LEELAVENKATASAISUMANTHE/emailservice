import { useEffect, useState } from 'react';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

const mockJobs = [
  { ref: '#ING-99211-BF', processType: 'Data Validation', health: 'idle', queueDepth: '0 Rows', time: '--:--:--' },
  { ref: '#ING-99208-CK', processType: 'Legacy Workbook', health: 'failure', queueDepth: '4,119 Rows', time: '00:01:02' }
];

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
        <h2>Active Ingestion Jobs</h2>
        <div className="jobs-actions">
          <button className="btn-secondary">Refresh Engine</button>
          <button className="btn-primary">Kill All Tasks</button>
        </div>
      </div>

      <table className="jobs-table">
        <thead>
          <tr>
            <th>Job Reference</th>
            <th>Process Type</th>
            <th>Health</th>
            <th>Queue Depth</th>
            <th>Execution Time</th>
            <th style={{ width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {activeJob && (
            <tr>
              <td className="job-ref">#{jobId.substring(0, 8).toUpperCase()}-AX</td>
              <td>Schema Mapping</td>
              <td>
                <div className="job-health">
                  <div className={`status-indicator ${activeJob.status === 'done' ? 'idle' : activeJob.status === 'failed' ? 'failure' : 'executing'}`}></div>
                  {activeJob.status.toUpperCase()}
                </div>
              </td>
              <td className="job-ref">{activeJob.totalRows ? `${activeJob.totalRows} Rows` : '---'}</td>
              <td className="execution-time">00:00:15</td>
              <td>
                 <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
              </td>
            </tr>
          )}
          {!activeJob && (
             <tr>
               <td className="job-ref">#ING-99210-AX</td>
               <td>Schema Mapping</td>
               <td>
                 <div className="job-health">
                   <div className="status-indicator executing"></div>
                   EXECUTING
                 </div>
               </td>
               <td className="job-ref">12,402 Rows</td>
               <td className="execution-time">00:12:45</td>
               <td>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
               </td>
             </tr>
          )}
          {mockJobs.map(mock => (
             <tr key={mock.ref}>
               <td className="job-ref">{mock.ref}</td>
               <td>{mock.processType}</td>
               <td>
                 <div className="job-health">
                   <div className={`status-indicator ${mock.health}`}></div>
                   {mock.health.toUpperCase()}
                 </div>
               </td>
               <td className="job-ref">{mock.queueDepth}</td>
               <td className="execution-time">{mock.time}</td>
               <td>
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
               </td>
             </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
