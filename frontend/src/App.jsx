import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import HomePage from './pages/HomePage';
import NotificationsPage from './pages/admin/NotificationsPage';
import NotificationDetailPage from './pages/admin/NotificationDetailPage';
import DashboardPage from './pages/student/DashboardPage';

const ImporterPage = lazy(() => import('./pages/admin/importer/ImporterPage'));

function PageLoader() {
  return (
    <main className="shell">
      <div className="skeleton" style={{ height: 36, width: '45%', marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 180 }} />
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="admin/notifications" element={<NotificationsPage />} />
          <Route path="admin/notifications/:jobId" element={<NotificationDetailPage />} />
          <Route
            path="admin/importer"
            element={(
              <Suspense fallback={<PageLoader />}>
                <ImporterPage />
              </Suspense>
            )}
          />
          <Route path="student/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
