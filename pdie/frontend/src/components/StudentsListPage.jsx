import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

const formatDate = (value) => {
  if (!value) {
    return 'Not sent';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not sent' : date.toLocaleString();
};

export default function StudentsListPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resendingId, setResendingId] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadStudents = async () => {
      setLoading(true);
      setError('');
      setNotice('');

      try {
        const response = await fetch(`${apiBase}/api/students`);
        const data = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load students');
        }

        if (!cancelled) {
          setStudents(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Failed to load students');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStudents();
    return () => {
      cancelled = true;
    };
  }, []);

  const resendLink = async (studentId) => {
    setResendingId(String(studentId));
    setError('');
    setNotice('');

    try {
      const response = await fetch(`${apiBase}/api/student-link/${studentId}/resend`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend link');
      }

      setNotice(`Link emailed to ${data.email}.`);
    } catch (requestError) {
      setError(requestError.message || 'Failed to resend link');
    } finally {
      setResendingId('');
    }
  };

  const generateAndSendLink = async (studentId) => {
    setResendingId(String(studentId));
    setError('');
    setNotice('');

    try {
      const response = await fetch(`${apiBase}/api/student-link/${studentId}/generate`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate link');
      }

      setStudents((current) => current.map((student) =>
        String(student.student_id) === String(studentId)
          ? {
            ...student,
            link_status: 'pending',
            link_created_at: new Date().toISOString()
          }
          : student
      ));
      setNotice(`New link generated and emailed to ${data.email}.`);
    } catch (requestError) {
      setError(requestError.message || 'Failed to generate link');
    } finally {
      setResendingId('');
    }
  };

  const getStatusLabel = (status) => {
    if (status === 'pending') return 'Pending';
    if (status === 'opened') return 'Opened';
    if (status === 'completed') return 'Completed';
    return 'No Link';
  };

  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="dashboard">
          <section className="hero hero-compact">
            <div className="hero-actions">
              <div>
                <h1>Students</h1>
                <p>
                  Review the latest imported students, their email targets, and the current status of their access link.
                </p>
              </div>
              <Link to="/" className="btn-secondary page-link">Back To Upload</Link>
            </div>
          </section>

          <section className="panel students-list-panel">
            <div className="panel-title">
              <h2>Student Records</h2>
            </div>

            {loading ? <p className="list-feedback">Loading students...</p> : null}
            {error ? <p className="list-feedback list-feedback-error">{error}</p> : null}
            {notice ? <p className="list-feedback list-feedback-success">{notice}</p> : null}

            {!loading && !error ? (
              <div className="students-table-wrap">
                <table className="jobs-table students-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Email</th>
                      <th>Branch</th>
                      <th>Status</th>
                      <th>Link Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length ? students.map((student) => (
                      <tr key={student.student_id}>
                        <td>
                          <div className="students-table-name">{student.student_name || 'Unnamed student'}</div>
                          <div className="students-table-sub">{student.student_id}</div>
                        </td>
                        <td>{student.email || student.college_email || 'Not available'}</td>
                        <td>{student.branch || 'Not available'}</td>
                        <td>
                          <span className={`status-pill status-${student.link_status || 'none'}`}>
                            {getStatusLabel(student.link_status)}
                          </span>
                        </td>
                        <td>{formatDate(student.link_created_at)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary students-action"
                            onClick={() => (
                              student.link_status
                                ? resendLink(student.student_id)
                                : generateAndSendLink(student.student_id)
                            )}
                            disabled={resendingId === String(student.student_id)}
                          >
                            {resendingId === String(student.student_id)
                              ? 'Sending...'
                              : student.link_status
                                ? 'Resend'
                                : 'Generate + Send'}
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="6" className="jobs-empty-state">No students found yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
