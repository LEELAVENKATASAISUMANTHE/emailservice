import ExcelJS from 'exceljs';

const normalizeCellValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }

    if (value.text) {
      return value.text;
    }

    if (value.result !== undefined) {
      return normalizeCellValue(value.result);
    }

    if (value.formula && value.result === undefined) {
      return value.formula;
    }
  }

  return value;
};

export const streamRows = async (buffer, onChunk, chunkSize = 500) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet('data');
  if (!sheet) {
    throw new Error('Workbook is missing the data worksheet');
  }

  const headers = sheet.getRow(1).values
    .slice(1)
    .map((value) => String(normalizeCellValue(value) || '').trim())
    .filter(Boolean);

  if (!headers.length) {
    return { totalRows: 0 };
  }

  let totalRows = 0;
  let chunk = [];

  const flush = async () => {
    if (!chunk.length) {
      return;
    }
    const payload = chunk;
    chunk = [];
    await onChunk(payload);
  };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const record = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      const cellValue = normalizeCellValue(row.getCell(index + 1).value);
      record[header] = cellValue;
      if (String(cellValue ?? '').trim() !== '') {
        hasValue = true;
      }
    });

    if (!hasValue) {
      continue;
    }

    Object.defineProperty(record, '__rowIndex', {
      value: rowNumber,
      enumerable: false
    });

    chunk.push(record);
    totalRows += 1;

    if (chunk.length >= chunkSize) {
      await flush();
    }
  }

  await flush();

  return { totalRows };
};
