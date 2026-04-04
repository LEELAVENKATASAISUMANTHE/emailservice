import { Route, Routes } from 'react-router-dom';
import AdminDashboard from './components/AdminDashboard.jsx';
import StudentFormPage from './components/StudentFormPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/student-form/:token" element={<StudentFormPage />} />
    </Routes>
  );
}
