import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const apiBase = import.meta.env.VITE_API_BASE_URL || '';

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

const formatStudentName = (student) => {
  const parts = [
    student?.full_name,
    [student?.first_name, student?.middle_name, student?.last_name].filter(Boolean).join(' ').trim()
  ].filter(Boolean);

  return parts[0] || 'Student';
};

export default function StudentFormPage() {
  const { token } = useParams();
  const [student, setStudent] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadStudent = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/api/student-link/${token}`);
        const data = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || 'Invalid or expired link');
        }

        if (!cancelled) {
          setStudent(data.student || null);
          setStatus(data.status || '');
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Invalid or expired link');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStudent();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="student-form-shell">
        <div className="student-form-card">
          <div className="panel-subtitle">Student Access</div>
          <h1>Loading your profile</h1>
          <p className="student-form-copy">Please wait while we validate your link and load your student record.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-form-shell">
        <div className="student-form-card">
          <div className="panel-subtitle">Student Access</div>
          <h1>Invalid or expired link</h1>
          <p className="student-form-copy">{error}</p>
          <Link className="btn-primary student-form-home" to="/">Return to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="student-form-shell">
      <div className="student-form-card">
        <div className="panel-subtitle">Student Access</div>
        <h1>Complete Your Profile</h1>
        <p className="student-form-copy">
          Your access link is active. Review the basic details below and continue to the next step when ready.
        </p>

        <div className="student-profile-block">
          <div className="student-profile-row">
            <span>Name</span>
            <strong>{formatStudentName(student)}</strong>
          </div>
          <div className="student-profile-row">
            <span>Email</span>
            <strong>{student?.email || student?.college_email || 'Not available'}</strong>
          </div>
          <div className="student-profile-row">
            <span>Branch</span>
            <strong>{student?.branch || 'Not available'}</strong>
          </div>
          <div className="student-profile-row">
            <span>Status</span>
            <strong>{status || 'opened'}</strong>
          </div>
        </div>

        <button type="button" className="btn-primary student-form-continue">Continue</button>
      </div>
    </div>
  );
}
