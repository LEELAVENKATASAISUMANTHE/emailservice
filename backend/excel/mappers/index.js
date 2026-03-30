import { mapStudentUploadRow } from "./student.mapper.js";
import { mapPlacementUploadRow } from "./placement.mapper.js";
import { mapOtherUploadRow } from "./other.mapper.js";

const rowMappers = {
  student: mapStudentUploadRow,
  placement: mapPlacementUploadRow,
  other: mapOtherUploadRow,
};

export function mapUploadRows(uploadType, rows, jobId) {
  const mapper = rowMappers[uploadType];

  if (!mapper) {
    throw new Error(`No row mapper configured for uploadType "${uploadType}"`);
  }

  return rows.map((row) => mapper(row, jobId));
}
