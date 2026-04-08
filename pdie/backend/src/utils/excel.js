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

export const readExcelMeta = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const metaSheet = workbook.getWorksheet('_meta');
  if (!metaSheet) {
    throw new Error('Invalid template - _meta sheet missing or corrupt');
  }

  const rawValue = metaSheet.getCell('A1').value;
  const payload = typeof rawValue === 'string' ? rawValue : normalizeCellValue(rawValue);

  try {
    const parsed = JSON.parse(String(payload || ''));
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid template payload');
    }
    return parsed;
  } catch (_error) {
    throw new Error('Invalid template - _meta sheet missing or corrupt');
  }
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

export const parseWorkbookRows = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet('data') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Workbook does not contain any worksheets');
  }

  const headers = sheet.getRow(1).values
    .slice(1)
    .map((value) => String(normalizeCellValue(value) || '').trim());

  const rows = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rowData = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) {
        return;
      }

      const cellValue = normalizeCellValue(row.getCell(index + 1).value);
      rowData[header] = cellValue;
      if (String(cellValue ?? '').trim() !== '') {
        hasValue = true;
      }
    });

    if (!hasValue) {
      continue;
    }

    rows.push(rowData);
  }

  return {
    headers: headers.filter(Boolean),
    rows
  };
};
