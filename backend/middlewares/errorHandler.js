function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  if (statusCode >= 500) {
    console.error("[error]", error);
  }

  res.status(statusCode).json({
    error: message
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
