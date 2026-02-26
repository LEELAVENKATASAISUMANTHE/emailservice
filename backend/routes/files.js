import express from "express";

export function createFilesRouter({ filesController }) {
  const router = express.Router();
  router.get("/:objectName", filesController.getFile);
  return router;
}
