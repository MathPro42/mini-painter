import { readBiffFirstSheet } from './biff';
import { startsWithBytes } from './bytes';
import { isCfb, readCfbStream } from './cfb';
import { parseCsv } from './csv';
import type { SheetRows } from './sheetRows';
import { readXlsxFirstSheet } from './xlsxRead';
import { isZip } from './zip';

/**
 * Reads the first sheet of an .xlsx, .xls or delimited-text file. The format
 * is told from the content, not the file name, since spreadsheets are often
 * saved under the wrong extension. Throws a RangeError for unreadable files.
 */
export async function readSpreadsheet(bytes: Uint8Array): Promise<SheetRows> {
  if (isZip(bytes)) {
    return readXlsxFirstSheet(bytes);
  }
  if (isCfb(bytes)) {
    const workbook = readCfbStream(bytes, 'Workbook');
    if (workbook === null) {
      throw new RangeError('Not an Excel workbook, or one older than Excel 97');
    }
    return readBiffFirstSheet(workbook);
  }
  return parseCsv(decodeText(bytes));
}

/**
 * Decodes text files the way spreadsheet apps write them: UTF-16 with a byte
 * order mark ("Unicode text"), UTF-8, or else the Windows Western code page.
 */
function decodeText(bytes: Uint8Array): string {
  if (startsWithBytes(bytes, [0xff, 0xfe])) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
