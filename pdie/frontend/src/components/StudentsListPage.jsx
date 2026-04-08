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
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
};

export default function StudentsListPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadStudents = async () => {
      setLoading(true);
      setError('');

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

  return (
    <div className="app-shell">
      <main className="main-content">
        <div className="dashboard">
          <section className="hero hero-compact">
            <div className="hero-actions">
              <div>
                <h1>Students</h1>
                <p>
                  Review all student records from the `students` table with the core profile, academic, and contact fields.
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

            {!loading && !error ? (
              <div className="students-table-wrap">
                <table className="jobs-table students-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>First Name</th>
                      <th>Middle Name</th>
                      <th>Last Name</th>
                      <th>Full Name</th>
                      <th>Gender</th>
                      <th>DOB</th>
                      <th>Email</th>
                      <th>Alt Email</th>
                      <th>College Email</th>
                      <th>Mobile</th>
                      <th>Emergency Contact</th>
                      <th>Nationality</th>
                      <th>Placement Fee Status</th>
                      <th>Student Photo Path</th>
                      <th>Created At</th>
                      <th>Branch</th>
                      <th>Graduation Year</th>
                      <th>Semester</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length ? students.map((student) => (
                      <tr key={student.student_id}>
                        <td>{student.student_id}</td>
                        <td>{student.first_name || 'Not available'}</td>
                        <td>{student.middle_name || 'Not available'}</td>
                        <td>{student.last_name || 'Not available'}</td>
                        <td>{student.full_name || 'Not available'}</td>
                        <td>{student.gender || 'Not available'}</td>
                        <td>{formatDate(student.dob)}</td>
                        <td>{student.email || 'Not available'}</td>
                        <td>{student.alt_email || 'Not available'}</td>
                        <td>{student.college_email || 'Not available'}</td>
                        <td>{student.mobile || 'Not available'}</td>
                        <td>{student.emergency_contact || 'Not available'}</td>
                        <td>{student.nationality || 'Not available'}</td>
                        <td>{student.placement_fee_status || 'Not available'}</td>
                        <td>{student.student_photo_path || 'Not available'}</td>
                        <td>{formatDate(student.created_at)}</td>
                        <td>{student.branch || 'Not available'}</td>
                        <td>{student.graduation_year || 'Not available'}</td>
                        <td>{student.semester || 'Not available'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="18" className="jobs-empty-state">No students found yet.</td>
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
