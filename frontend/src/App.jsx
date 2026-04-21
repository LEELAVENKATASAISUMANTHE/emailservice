import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import HomePage from './pages/HomePage';
import NotificationsPage from './pages/admin/NotificationsPage';
import NotificationDetailPage from './pages/admin/NotificationDetailPage';
import ImporterPage from './pages/admin/importer/ImporterPage';
import DashboardPage from './pages/student/DashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="admin/notifications" element={<NotificationsPage />} />
          <Route path="admin/notifications/:jobId" element={<NotificationDetailPage />} />
          <Route path="admin/importer" element={<ImporterPage />} />
          <Route path="student/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
