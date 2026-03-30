export function mapPlacementUploadRow(row, jobId) {
  const student = {
    uploadType: "student",
    name: String(row["students.name"] || row.name || "").trim(),
    email: String(row["students.email"] || row.email || "").trim().toLowerCase(),
    class: String(row["classes.className"] || row.class || "").trim(),
    department: String(row["students.department"] || row.department || "").trim(),
    sourceJobId: String(jobId),
  };

  const placement = {
    uploadType: "placement",
    company: String(row["placements.company"] || "").trim(),
    status: String(row["placements.status"] || "").trim() || null,
    studentEmail: student.email,
    studentName: student.name,
    department: student.department,
    sourceJobId: String(jobId),
  };

  return {
    sourceRow: row,
    domains: {
      student,
      placement,
    },
  };
}
