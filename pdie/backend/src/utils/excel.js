import fs from 'fs';
import ExcelJS from 'exceljs';

const workbookOptions = {
  entries: 'emit',
  worksheets: 'emit',
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

    // Safety timeout: if nothing resolves/rejects within 30s, resolve with whatever we have
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(metadata);
      }
    }, 30_000);

    reader.on('worksheet', (worksheet) => {
      if (worksheet.name !== '_meta') {
        worksheet.on('finished', () => {});
        worksheet.on('row', () => {});
        return;
      }
      worksheet.on('row', (row) => {
        const key = row.getCell(1).text;
        const value = row.getCell(2).text;
        if (key && key !== 'key') {
          metadata[key] = value;
        }
      });
      worksheet.on('finished', () => {
        clearTimeout(timeout);
        finish();
      });
    });

    reader.on('end', () => {
      clearTimeout(timeout);
      finish();
    });
    reader.on('error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    stream.on('error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    // Kick off the reader (required in some ExcelJS versions)
    if (typeof reader.read === 'function') {
      reader.read();
    }
  });

export const streamExcelRows = ({ filePath, onHeader, onRowsChunk, chunkSize = 1000 }) =>
  new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(stream, workbookOptions);
    const worksheetChains = [];
    let resolved = false;
    let rejected = false;

    const finish = () => {
      if (resolved || rejected) return;
      resolved = true;
      Promise.all(worksheetChains).then(() => resolve()).catch(reject);
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
        chain = chain.then(task).catch((err) => {
          if (!rejected) {
            rejected = true;
            reject(err);
          }
          throw err;
        });
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
      if (!resolved && !rejected) {
        rejected = true;
        reject(err);
      }
    });

    stream.on('error', (err) => {
      if (!resolved && !rejected) {
        rejected = true;
        reject(err);
      }
    });

    // Kick off the reader
    if (typeof reader.read === 'function') {
      reader.read();
    }
  });
