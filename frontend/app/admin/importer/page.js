import ImporterPage from './components/ImporterPage';

export const metadata = {
  title: 'DB Importer — Placement ERP',
  description: 'Import spreadsheet data directly into PostgreSQL',
};

export default function Page() {
  return <ImporterPage />;
}
