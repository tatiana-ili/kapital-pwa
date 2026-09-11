import { inspectStatementTable, stableHash } from './parser.ts';
import type {
  StatementCell,
  StatementFileFormat,
  StatementSource,
  StatementTable,
} from './types.ts';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function readStatementFile(file: File): Promise<StatementSource> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Файл больше 20 МБ. Выберите более короткую выписку.');
  }

  const fileFormat = detectFileFormat(file);
  const bytes = await file.arrayBuffer();
  const fileHash = await hashBytes(bytes);
  let table: StatementTable;
  let warning: string | undefined;

  if (fileFormat === 'csv') {
    table = parseCsv(decodeText(bytes));
  } else if (fileFormat === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    table = (await readSheet(bytes)) as StatementTable;
  } else {
    table = await readPdf(bytes);
    warning =
      'PDF распознаётся по текстовому слою. Если это скан, сохраните выписку как XLSX или CSV.';
  }

  return {
    fileName: file.name,
    fileFormat,
    fileHash,
    table,
    inspection: inspectStatementTable(table, file.name),
    warning,
  };
}

function detectFileFormat(file: File): StatementFileFormat {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('ru');
  if (extension === 'csv') return 'csv';
  if (extension === 'xlsx') return 'xlsx';
  if (extension === 'pdf') return 'pdf';
  throw new Error('Поддерживаются только файлы CSV, XLSX и PDF.');
}

function decodeText(bytes: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

export function parseCsv(input: string): StatementTable {
  const delimiter = detectDelimiter(input);
  const rows: StatementCell[][] = [];
  let row: StatementCell[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += character;
  }

  row.push(cell.trim());
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function detectDelimiter(input: string) {
  const sampleLines = input.split(/\r?\n/).slice(0, 12);
  const candidates = [';', '\t', ','] as const;
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: sampleLines.reduce(
        (sum, line) => sum + countOutsideQuotes(line, delimiter),
        0,
      ),
    }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function countOutsideQuotes(line: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

async function readPdf(bytes: ArrayBuffer): Promise<StatementTable> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
  }).promise;
  const table: StatementTable = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .flatMap((item) =>
        'str' in item && 'transform' in item
          ? [
              {
                str: item.str.trim(),
                width: item.width,
                x: item.transform[4],
                y: item.transform[5],
              },
            ]
          : [],
      )
      .filter((item) => item.str);
    const lines = new Map<number, typeof items>();

    for (const item of items) {
      const lineKey = Math.round(item.y / 3) * 3;
      lines.set(lineKey, [...(lines.get(lineKey) ?? []), item]);
    }

    [...lines.entries()]
      .sort(([left], [right]) => right - left)
      .forEach(([, lineItems]) => {
        const ordered = [...lineItems].sort((left, right) => left.x - right.x);
        const cells: string[] = [];
        let lastEnd = Number.NEGATIVE_INFINITY;

        for (const item of ordered) {
          if (item.x - lastEnd > 14 || cells.length === 0) {
            cells.push(item.str);
          } else {
            cells[cells.length - 1] = `${cells[cells.length - 1]} ${item.str}`;
          }
          lastEnd = Math.max(lastEnd, item.x + item.width);
        }
        if (cells.length) table.push(cells);
      });
  }

  if (!table.length) {
    throw new Error(
      'В PDF нет текстового слоя. Это похоже на скан — используйте CSV или XLSX.',
    );
  }
  return table;
}

async function hashBytes(bytes: ArrayBuffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }
  return stableHash(
    [...new Uint8Array(bytes)]
      .slice(0, 100_000)
      .map((value) => String.fromCharCode(value))
      .join(''),
  );
}
