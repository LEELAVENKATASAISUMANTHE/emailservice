import { z } from "zod";

const eligibleStudentSchema = z.object({
  student_id: z.string().min(1),
  full_name: z.string().min(1),
  email: z.string().email()
});

export const pendingNotificationSchema = z.object({
  jobId: z.number().int().positive(),
  companyName: z.string().min(1),
  criteria: z.record(z.any()),
  eligibleStudents: z.array(eligibleStudentSchema),
  eligibleCount: z.number().int().nonnegative(),
  applicationDeadline: z.coerce.date(),
  processedAt: z.coerce.date().optional()
});
