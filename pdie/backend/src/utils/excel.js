import fs from 'fs';
import ExcelJS from 'exceljs';

const workbookOptions = {
  entries: 'emit',
  sharedStrings: 'cache',
  hyperlinks: 'cache',
  styles: 'cache'
};

export const readTemplateMetadata = (filePath) =>
  new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(stream, workbookOptions);
    let resolved = false;
    const metadata = {};

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(metadata);
      }
    };

    reader.on('worksheet', (worksheet) => {
      if (worksheet.name !== '_meta') {
        worksheet.on('finished', () => {});
        worksheet.on('row', () => {});
        return;
      }
      worksheet.on('row', (row) => {
        const key = row.getCell(1).text;
        const value = row.getCell(2).text;
        if (key) {
          metadata[key] = value;
        }
      });
      worksheet.on('finished', finish);
    });

    reader.on('end', finish);
    reader.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });

export const streamExcelRows = ({ filePath, onHeader, onRowsChunk, chunkSize = 1000 }) =>
  new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(stream, workbookOptions);
    const worksheetChains = [];
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        Promise.all(worksheetChains).then(() => resolve()).catch(reject);
      }
    };

    reader.on('worksheet', (worksheet) => {
      if (worksheet.name.startsWith('_')) {
        worksheet.on('row', () => {});
        worksheet.on('finished', () => {});
        return;
      }

      let headers = [];
      let buffer = [];
      let chain = Promise.resolve();

      const enqueue = (task) => {
        chain = chain.then(task);
      };

      const flushBuffer = () => {
        if (!buffer.length) return Promise.resolve();
        const payload = buffer;
        buffer = [];
        return onRowsChunk ? onRowsChunk(payload) : Promise.resolve();
      };

      worksheet.on('row', (row) => {
        enqueue(async () => {
          if (row.number === 1) {
            headers = row.values.slice(1).map((value) => (value || '').toString().trim());
            if (onHeader) {
              await onHeader(headers);
            }
            return;
          }
          if (!headers.length) {
            return;
          }
          const rowValues = {};
          headers.forEach((header, idx) => {
            const cell = row.getCell(idx + 1);
            rowValues[header] = cell?.value ?? null;
          });
          rowValues.rowNumber = row.number;
          buffer.push(rowValues);
          if (buffer.length === chunkSize) {
            await flushBuffer();
          }
        });
      });

      worksheet.on('finished', () => {
        enqueue(async () => {
          await flushBuffer();
        });
        worksheetChains.push(chain);
      });
    });

    reader.on('end', finish);
    reader.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
