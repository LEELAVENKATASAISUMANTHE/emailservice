/** @type {import('next').NextConfig} */
const dbImporterUrl = process.env.DB_IMPORTER_URL || 'http://localhost:3001';

const nextConfig = {
  env: {
    VITE_API_URL: process.env.VITE_API_URL,
  },
  async rewrites() {
    return [
      { source: '/api/tables',          destination: `${dbImporterUrl}/api/tables` },
      { source: '/api/schema/:path*',   destination: `${dbImporterUrl}/api/schema/:path*` },
      { source: '/api/template/:path*', destination: `${dbImporterUrl}/api/template/:path*` },
      { source: '/api/import-history',  destination: `${dbImporterUrl}/api/import-history` },
      { source: '/api/import/:path*',   destination: `${dbImporterUrl}/api/import/:path*` },
      { source: '/api/mongo/:path*',    destination: `${dbImporterUrl}/api/mongo/:path*` },
    ];
  },
};

export default nextConfig;
