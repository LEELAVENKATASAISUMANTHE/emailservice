import express from "express";

export function createStudentDashboardRouter({ studentDashboardController }) {
  const router = express.Router();
  router.get("/dashboard", studentDashboardController.dashboard);
  return router;
}
