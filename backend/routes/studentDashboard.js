const express = require("express");

function createStudentDashboardRouter({ getActiveJobsForStudent }) {
  const router = express.Router();

  router.get("/dashboard", async (req, res, next) => {
    try {
      const studentId = req.query.studentId;
      const data = await getActiveJobsForStudent(studentId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createStudentDashboardRouter };
