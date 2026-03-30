import ImportedOtherRecord from "../../db/models/ImportedOtherRecord.js";

export async function persistOtherRows(mappedRows) {
  let insertedCount = 0;
  const dbFailures = [];

  for (const mappedRow of mappedRows) {
    try {
      const { otherRecord } = mappedRow.domains;

      await ImportedOtherRecord.updateOne(
        {
          sourceJobId: otherRecord.sourceJobId,
          sourceRowNumber: otherRecord.sourceRowNumber,
        },
        {
          $set: otherRecord,
        },
        { upsert: true }
      );

      insertedCount += 1;
    } catch (error) {
      dbFailures.push({
        ...mappedRow.sourceRow,
        error: error.message || "Generic record persistence failed",
      });
    }
  }

  return { insertedCount, dbFailures };
}
