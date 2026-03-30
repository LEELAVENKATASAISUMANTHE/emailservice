import mongoose from "mongoose";
import ImportedStudent from "../../db/models/ImportedStudent.js";
import ImportedClass from "../../db/models/ImportedClass.js";

export async function persistStudentRows(mappedRows) {
  return persistRowsWithTransactions(mappedRows, async (mappedRow, session) => {
    const { student, importedClass } = mappedRow.domains;

    await ImportedClass.updateOne(
      {
        uploadType: importedClass.uploadType,
        className: importedClass.className,
        department: importedClass.department,
      },
      {
        $set: {
          sourceJobId: importedClass.sourceJobId,
        },
      },
      { upsert: true, session }
    );

    await ImportedStudent.updateOne(
      {
        uploadType: student.uploadType,
        email: student.email,
      },
      {
        $set: {
          name: student.name,
          class: student.class,
          department: student.department,
          sourceJobId: student.sourceJobId,
        },
      },
      { upsert: true, session }
    );
  });
}

async function persistRowsWithTransactions(mappedRows, writer) {
  let insertedCount = 0;
  const dbFailures = [];

  for (const mappedRow of mappedRows) {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        await writer(mappedRow, session);
      });
      insertedCount += 1;
    } catch (error) {
      dbFailures.push({
        ...mappedRow.sourceRow,
        error: error.message || "Student persistence failed",
      });
    } finally {
      await session.endSession();
    }
  }

  return { insertedCount, dbFailures };
}
