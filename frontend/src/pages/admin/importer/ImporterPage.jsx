import { ChakraProvider } from '@chakra-ui/react';
import Importer from './Importer';
import './importer.css';

export default function ImporterPage() {
  return (
    <ChakraProvider resetCSS={false}>
      <main className="shell">
        <section className="hero">
          <h1>DB Importer</h1>
          <p>Select a table, upload a spreadsheet, and import rows directly into PostgreSQL.</p>
        </section>

        <section className="card" style={{ marginBottom: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              Use the sections below to check the source database, import rows, review credentials, and inspect history.
            </p>
            <nav className="navbar-links" aria-label="Importer sections">
              <a href="#mongo-status" className="navbar-link">MongoDB</a>
              <a href="#import" className="navbar-link">Importer</a>
              <a href="#credentials" className="navbar-link">Credentials</a>
              <a href="#history" className="navbar-link">History</a>
            </nav>
          </div>
        </section>

        <Importer />
      </main>
    </ChakraProvider>
  );
}
