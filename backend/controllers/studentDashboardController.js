export function createStudentDashboardController({ getActiveJobsForStudent }) {
  async function dashboard(req, res, next) {
    try {
      const studentId = req.query.studentId;
      const data = await getActiveJobsForStudent(studentId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  return { dashboard };
}
