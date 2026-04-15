"use client";

import { ChakraProvider } from '@chakra-ui/react';
import Importer from './Importer';

export default function ImporterPage() {
  return (
    <ChakraProvider resetCSS={false}>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">DB Importer</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Select a table, upload a spreadsheet, and import rows directly into PostgreSQL.
              </p>
            </div>
            <nav className="flex items-center gap-4 text-sm">
              <a href="#mongo-status" className="text-gray-600 hover:text-gray-900">MongoDB</a>
              <a href="#import" className="text-gray-600 hover:text-gray-900">Importer</a>
              <a href="#credentials" className="text-gray-600 hover:text-gray-900">Credentials</a>
              <a href="#history" className="text-gray-600 hover:text-gray-900">History</a>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Importer />
        </main>
      </div>
    </ChakraProvider>
  );
}
