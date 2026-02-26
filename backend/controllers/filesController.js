export function createFilesController({ getFileStreamByApiPath, getFileStatByApiPath }) {
  async function getFile(req, res, next) {
    try {
      const apiPath = `/api/files/${req.params.objectName || ""}`;
      const [fileStat, fileStream] = await Promise.all([
        getFileStatByApiPath(apiPath),
        getFileStreamByApiPath(apiPath)
      ]);

      if (fileStat?.metaData?.["content-type"]) {
        res.setHeader("Content-Type", fileStat.metaData["content-type"]);
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }

      if (typeof fileStat?.size === "number") {
        res.setHeader("Content-Length", String(fileStat.size));
      }

      fileStream.on("error", next);
      fileStream.pipe(res);
    } catch (error) {
      if (error.code === "NoSuchKey" || error.code === "NotFound") {
        res.status(404).json({ error: "File not found." });
        return;
      }

      next(error);
    }
  }

  return { getFile };
}
