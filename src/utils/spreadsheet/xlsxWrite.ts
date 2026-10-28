import { escapeXmlAttribute, escapeXmlText } from '../xml';
import type { SheetRows } from './sheetRows';
import { createZip } from './zipWrite';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

/**
 * Builds a one-sheet .xlsx workbook holding `rows` as text cells. It is the
 * minimal package spreadsheet apps accept: no styles, no shared strings.
 */
export function writeXlsx(rows: SheetRows, sheetName: string): Uint8Array {
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="${CONTENT_TYPE}.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CONTENT_TYPE}.worksheet+xml"/>` +
        `</Types>`,
    ],
    ['_rels/.rels', relationships(`${RELATIONSHIP_NS}/officeDocument`, 'xl/workbook.xml')],
    [
      'xl/workbook.xml',
      `<workbook xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIP_NS}"><sheets>` +
        `<sheet name="${escapeXmlAttribute(sheetName)}" sheetId="1" r:id="rId1"/>` +
        `</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      relationships(`${RELATIONSHIP_NS}/worksheet`, 'worksheets/sheet1.xml'),
    ],
    ['xl/worksheets/sheet1.xml', worksheet(rows)],
  ];
  const encoder = new TextEncoder();
  return createZip(
    parts.map(([name, xml]) => ({ name, data: encoder.encode(XML_DECLARATION + xml) })),
  );
}

function relationships(type: string, target: string): string {
  return (
    `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}">` +
    `<Relationship Id="rId1" Type="${type}" Target="${target}"/>` +
    `</Relationships>`
  );
}

function worksheet(rows: SheetRows): string {
  const body = rows
    .map((cells, rowIndex) => {
      const row = String(rowIndex + 1);
      const xml = cells
        .map((text, columnIndex) =>
          text === ''
            ? ''
            : `<c r="${columnName(columnIndex)}${row}" t="inlineStr"><is><t>${escapeXmlText(text)}</t></is></c>`,
        )
        .join('');
      return `<row r="${row}">${xml}</row>`;
    })
    .join('');
  return `<worksheet xmlns="${MAIN_NS}"><sheetData>${body}</sheetData></worksheet>`;
}

/** Spreadsheet column letters for a zero-based index (0 → "A", 26 → "AA"). */
export function columnName(index: number): string {
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}
