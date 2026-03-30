import mongoose from "mongoose";
import ImportedStudent from "../../db/models/ImportedStudent.js";
import ImportedPlacement from "../../db/models/ImportedPlacement.js";

export async function persistPlacementRows(mappedRows) {
  let insertedCount = 0;
  const dbFailures = [];

  for (const mappedRow of mappedRows) {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const { student, placement } = mappedRow.domains;

        await ImportedStudent.updateOne(
          {
            uploadType: student.uploadType,
            email: student.email,
          },
          {
            $set: {
              name: student.name,
              department: student.department,
              sourceJobId: student.sourceJobId,
            },
            $setOnInsert: {
              class: student.class || "",
            },
          },
          { upsert: true, session }
        );

        await ImportedPlacement.updateOne(
          {
            uploadType: placement.uploadType,
            company: placement.company,
            studentEmail: placement.studentEmail,
          },
          {
            $set: {
              status: placement.status,
              studentName: placement.studentName,
              department: placement.department,
              sourceJobId: placement.sourceJobId,
            },
          },
          { upsert: true, session }
        );
      });

      insertedCount += 1;
    } catch (error) {
      dbFailures.push({
        ...mappedRow.sourceRow,
        error: error.message || "Placement persistence failed",
      });
    } finally {
      await session.endSession();
    }
  }

  return { insertedCount, dbFailures };
}
