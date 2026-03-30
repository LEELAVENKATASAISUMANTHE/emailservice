import { persistStudentRows } from "./student.persistence.js";
import { persistPlacementRows } from "./placement.persistence.js";
import { persistOtherRows } from "./other.persistence.js";

const persistenceHandlers = {
  student: persistStudentRows,
  placement: persistPlacementRows,
  other: persistOtherRows,
};

export async function persistMappedRows(uploadType, mappedRows) {
  const handler = persistenceHandlers[uploadType];

  if (!handler) {
    throw new Error(`No persistence handler configured for uploadType "${uploadType}"`);
  }

  return handler(mappedRows);
}
