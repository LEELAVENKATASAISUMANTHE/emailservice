// changes by nakul: Excel parser isolated from the existing notification flow
import ExcelJS from "exceljs";
import {
  buildTemplateFields,
  getTemplateMetadataSheetName,
} from "../services/excel.service.js";

export async function parseExcel(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Uploaded workbook does not contain any worksheet");
  }

  const templateMetadata = readTemplateMetadata(workbook);
  const columns = templateMetadata?.fields?.length
    ? templateMetadata.fields
    : [
        { key: "students.name", label: "Name", legacyKey: "name" },
        { key: "students.email", label: "Email", legacyKey: "email" },
        { key: "classes.className", label: "Class", legacyKey: "class" },
        { key: "students.department", label: "Department", legacyKey: "department" },
      ];

  validateWorksheetHeaders(worksheet, columns);

  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const values = { rowNumber };

    columns.forEach((column, index) => {
      const cellText = row.getCell(index + 1).text?.trim() || "";
      values[column.key] = cellText;
      if (column.legacyKey) {
        values[column.legacyKey] = cellText;
      }
    });

    const hasAnyValue = columns.some((column) => String(values[column.key] || "").trim());

    if (!hasAnyValue) {
      return;
    }

    rows.push(values);
  });

  return {
    rows,
    template: templateMetadata || {
      version: 1,
      templateName: "Student Upload Template",
      uploadType: "student",
      fields: columns,
    },
  };
}

function readTemplateMetadata(workbook) {
  const metadataSheet = workbook.getWorksheet(getTemplateMetadataSheetName());

  if (!metadataSheet) {
    return null;
  }

  const rawMetadata = metadataSheet.getCell("A1").text?.trim();

  if (!rawMetadata) {
    return null;
  }

  const parsed = JSON.parse(rawMetadata);

  return {
    version: parsed.version || 1,
    templateName: parsed.templateName || "Upload Template",
    uploadType: parsed.uploadType || "student",
    fields: buildTemplateFields(parsed.fields || [], parsed.uploadType || "student"),
  };
}

function validateWorksheetHeaders(worksheet, columns) {
  columns.forEach((column, index) => {
    const actualHeader = worksheet.getRow(1).getCell(index + 1).text?.trim() || "";

    if (actualHeader !== column.label) {
      throw new Error(
        `Template header mismatch at column ${index + 1}. Expected "${column.label}" but received "${actualHeader || "blank"}"`
      );
    }
  });

  const headerRow = worksheet.getRow(1);

  for (let columnNumber = columns.length + 1; columnNumber <= headerRow.cellCount; columnNumber += 1) {
    const extraHeader = headerRow.getCell(columnNumber).text?.trim() || "";

    if (extraHeader) {
      throw new Error(`Unexpected template header "${extraHeader}" at column ${columnNumber}`);
    }
  }
}
