import rateLimit from "express-rate-limit";

const rateWindowMs = Number(process.env.EXCEL_UPLOAD_RATE_WINDOW_MS || 60 * 1000);
const rateMax = Number(process.env.EXCEL_UPLOAD_RATE_MAX || 2);

export const excelUploadRateLimit = rateLimit({
  windowMs: rateWindowMs,
  limit: rateMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.excelAuth?.requesterId || req.ip || "excel-anonymous-uploader",
  message: {
    error: `Upload rate limit exceeded. Maximum ${rateMax} upload(s) allowed every ${Math.ceil(
      rateWindowMs / 1000
    )} seconds`,
  },
});
