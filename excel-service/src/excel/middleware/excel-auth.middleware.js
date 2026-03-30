import ExcelJob from "../../db/models/ExcelJob.js";

const requesterHeader = "x-user-id";
const adminKeyHeader = "x-admin-api-key";

function getAdminApiKey() {
  return process.env.EXCEL_ADMIN_API_KEY || "";
}

function isAdminRequest(req) {
  const configuredKey = getAdminApiKey();
  const providedKey = String(req.header(adminKeyHeader) || "");

  return Boolean(configuredKey) && providedKey === configuredKey;
}

function getRequesterId(req) {
  return String(req.header(requesterHeader) || "").trim();
}

export function attachExcelRequester(req, _res, next) {
  req.excelAuth = {
    requesterId: getRequesterId(req),
    isAdmin: isAdminRequest(req),
  };
  next();
}

export function requireExcelAdmin(req, res, next) {
  const configuredKey = getAdminApiKey();

  if (!configuredKey) {
    return res.status(503).json({
      error: "Excel admin access is not configured",
    });
  }

  if (!req.excelAuth?.isAdmin) {
    return res.status(403).json({
      error: "Admin access is required",
    });
  }

  if (!req.excelAuth?.requesterId) {
    return res.status(400).json({
      error: `Missing requester identity header: ${requesterHeader}`,
    });
  }

  return next();
}

export async function requireExcelJobAccess(req, res, next) {
  try {
    const { jobId } = req.params;
    const requesterId = req.excelAuth?.requesterId;
    const admin = req.excelAuth?.isAdmin;

    if (!requesterId && !admin) {
      return res.status(400).json({
        error: `Missing requester identity header: ${requesterHeader}`,
      });
    }

    const job = await ExcelJob.findOne({ jobId: String(jobId) }).lean();

    if (!job) {
      return res.status(404).json({ error: "Excel job not found" });
    }

    if (!admin && job.createdBy !== requesterId) {
      return res.status(403).json({
        error: "You do not have access to this Excel job",
      });
    }

    req.excelJob = job;
    return next();
  } catch (error) {
    console.error("Error authorizing Excel job access:", error);
    return res.status(500).json({ error: "Failed to authorize Excel job access" });
  }
}
