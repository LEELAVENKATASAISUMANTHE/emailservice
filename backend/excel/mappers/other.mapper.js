export function mapOtherUploadRow(row, jobId) {
  const payload = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "rowNumber")
  );

  return {
    sourceRow: row,
    domains: {
      otherRecord: {
        uploadType: "other",
        payload,
        sourceJobId: String(jobId),
        sourceRowNumber: row.rowNumber,
      },
    },
  };
}
