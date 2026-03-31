import { useState } from 'react';
import axios from 'axios';
import { UploadCloud, FileSpreadsheet, ListChecks } from 'lucide-react';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || ''
});

const Section = ({ title, icon: Icon, children }) => (
  <section className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl shadow-black/50">
    <header className="mb-6 flex items-center gap-3">
      <Icon className="h-6 w-6 text-accent" />
      <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
    </header>
    {children}
  </section>
);

function App() {
  const [tables, setTables] = useState('students,placements');
  const [template, setTemplate] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const requestTemplate = async (event) => {
    event.preventDefault();
    setTemplateLoading(true);
    setError(null);
    try {
      const body = { tables: tables.split(',').map((name) => name.trim()).filter(Boolean) };
      const { data } = await api.post('/api/templates', body);
      setTemplate(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadFile) {
      setError('Select an Excel template-generated file first.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const { data } = await api.post('/api/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadResult(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#04060d] via-[#050a19] to-[#030712] px-6 py-12 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Placement Data Ingestion Engine</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Control Deck</h1>
          <p className="mt-2 text-slate-400">Generate compliant templates, validate uploads, and monitor ingestion in real time.</p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Template Builder" icon={FileSpreadsheet}>
            <form className="space-y-6" onSubmit={requestTemplate}>
              <label className="block text-sm font-medium text-slate-300">
                Target tables (comma-separated)
                <input
                  type="text"
                  value={tables}
                  onChange={(event) => setTables(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-accent/70"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-accent px-5 py-3 font-semibold text-slate-900 transition hover:bg-accent/80"
                disabled={templateLoading}
              >
                {templateLoading ? 'Analyzing schema…' : 'Generate template'}
              </button>
            </form>
            {template && (
              <article className="mt-6 rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Template ready</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{template.templateId}</h3>
                <ul className="mt-4 space-y-1 text-slate-300">
                  <li>
                    <span className="text-slate-400">Tables:</span> {template.tables.join(', ')}
                  </li>
                  <li>
                    <span className="text-slate-400">Columns:</span> {template.headers.length}
                  </li>
                  <li>
                    <span className="text-slate-400">Checksum:</span> {template.checksum.slice(0, 12)}…
                  </li>
                </ul>
              </article>
            )}
          </Section>

          <Section title="Upload Processor" icon={UploadCloud}>
            <form className="space-y-6" onSubmit={handleUpload}>
              <label className="block text-sm font-medium text-slate-300">
                Excel file generated from PDIE template
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                  className="mt-2 w-full rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-5 text-white outline-none transition"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-white/90 px-5 py-3 font-semibold text-slate-900 transition hover:bg-white"
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Validate & ingest'}
              </button>
            </form>
            {uploadResult && (
              <article className="mt-6 rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Upload</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{uploadResult.uploadId}</h3>
                <ul className="mt-4 space-y-1 text-slate-300">
                  <li>
                    <span className="text-slate-400">Rows:</span> {uploadResult.rowCount}
                  </li>
                  <li>
                    <span className="text-slate-400">Mode:</span> {uploadResult.processingMode}
                  </li>
                  {uploadResult.duplicateOf && (
                    <li>
                      <span className="text-slate-400">Duplicate of:</span> {uploadResult.duplicateOf}
                    </li>
                  )}
                </ul>
              </article>
            )}
          </Section>
        </div>

        <Section title="Operational Notes" icon={ListChecks}>
          <ul className="space-y-3 text-sm text-slate-300">
            <li>• Templates are cached in MongoDB and delivered via MinIO; reuse the templateId to avoid churn.</li>
            <li>• Uploads under 5K rows ingest synchronously; heavier files are chunked (1K rows) and pumped through Redpanda.</li>
            <li>• Validation, processing, and failure trails are persisted in MongoDB collections for auditability.</li>
            <li>• Duplicate uploads are detected automatically via SHA256 hash comparison.</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

export default App;
