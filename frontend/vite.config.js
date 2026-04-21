import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dbImporterUrl = process.env.DB_IMPORTER_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/tables': dbImporterUrl,
      '/api/schema': dbImporterUrl,
      '/api/template': dbImporterUrl,
      '/api/import-history': dbImporterUrl,
      '/api/import': dbImporterUrl,
      '/api/mongo': dbImporterUrl,
    },
  },
});
