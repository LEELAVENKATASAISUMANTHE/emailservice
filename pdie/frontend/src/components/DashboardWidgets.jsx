export function StorageMetrics() {
  return (
    <div className="panel storage-metrics">
      <h2>Storage Metrics</h2>
      <div className="storage-value">1.2 TB</div>
      <div className="storage-label">Current Volume Across All Namespaces</div>
      
      <svg className="storage-bg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="30" rx="40" ry="15" fill="#D1D5DB" />
        <path d="M 10 30 L 10 50 A 40 15 0 0 0 90 50 L 90 30 Z" fill="#E5E7EB" />
        <ellipse cx="50" cy="50" rx="40" ry="15" fill="#D1D5DB" />
        <path d="M 10 50 L 10 70 A 40 15 0 0 0 90 70 L 90 50 Z" fill="#E5E7EB" />
        <ellipse cx="50" cy="70" rx="40" ry="15" fill="#D1D5DB" />
      </svg>
    </div>
  );
}

export function LiveStream() {
  return (
    <div className="panel live-stream">
      <div className="live-stream-header">
        <h2>Live Stream</h2>
        <div className="pulse"></div>
      </div>
      <div className="log-viewer">
        <div className="log-line"><span>[09:42:11]</span> TRACE: Connection established to PG_MAIN</div>
        <div className="log-line"><span>[09:42:15]</span> DEBUG: Parsing workbook chunk 001</div>
        <div className="log-line"><span>[09:42:18]</span> INFO: Task #ING-99210-AX elevated to priority 1</div>
        <div className="log-line warn"><span>[09:42:22]</span> WARN: Memory pressure detected on node_02</div>
      </div>
    </div>
  );
}
