import { Router } from "express";
import { getStudentDashboard } from "../controller/student.controller.js";

const router = Router();

// GET /api/student/dashboard?studentId=1BY23CS132
router.get("/dashboard", getStudentDashboard);

export default router;
