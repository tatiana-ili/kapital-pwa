import { inspectStatementTable, stableHash } from './parser.ts';
import { detectBankParser, inferBankMapping } from './banks/index.ts';
import { parseKnownBankPdf, type PdfTextPage } from './pdf-layout.ts';
import type {
  StatementCell,
  StatementFileFormat,
  StatementSource,
  StatementTable,
} from './types.ts';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type ReadStatementOptions = {
  onPdfProgress?: (currentPage: number, totalPages: number) => void;
};

export async function readStatementFile(
  file: File,
  options: ReadStatementOptions = {},
): Promise<StatementSource> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Файл больше 50 МБ. Выберите более короткую выписку.');
  }

  const fileFormat = detectFileFormat(file);
  const bytes = await file.arrayBuffer();
  const fileHash = await hashBytes(bytes);
  let table: StatementTable;
  let warning: string | undefined;
  let pdfDiagnostics: StatementSource['pdfDiagnostics'];
  let detectedPdfBank: StatementSource['inspection']['detectedBank'];

  if (fileFormat === 'csv') {
    table = parseCsv(decodeText(bytes));
  } else if (fileFormat === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    table = (await readSheet(bytes)) as StatementTable;
  } else {
    const pdf = await readPdf(bytes, file.name, options.onPdfProgress);
    table = pdf.table;
    pdfDiagnostics = 'diagnostics' in pdf ? pdf.diagnostics : undefined;
    detectedPdfBank = 'bank' in pdf ? pdf.bank : undefined;
    if (!pdfDiagnostics || pdfDiagnostics.confidence !== 'high') {
      warning =
        'PDF прочитан по текстовому слою. Проверьте только отмеченные расхождения перед сохранением.';
    }
  }

  const inspection = inspectStatementTable(table, file.name);
  const bankParser = detectBankParser(
    file.name,
    table,
    inspection.headerRowIndex,
  );
  inspection.detectedBank = detectedPdfBank ?? bankParser?.id;
  if (bankParser) {
    inspection.mapping = inferBankMapping(
      bankParser.id,
      inspection.headers,
      inspection.mapping,
    );
  }

  return {
    fileName: file.name,
    fileFormat,
    fileHash,
    table,
    inspection,
    warning,
    pdfDiagnostics,
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

async function readPdf(
  bytes: ArrayBuffer,
  fileName: string,
  onProgress?: (currentPage: number, totalPages: number) => void,
) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
  }).promise;
  const pages: PdfTextPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
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
    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      items,
    });
    onProgress?.(pageNumber, document.numPages);
  }

  if (!pages.some((page) => page.items.length)) {
    throw new Error(
      'В PDF нет текстового слоя. Это похоже на скан или обезличенную копию-изображение — импортируйте оригинальный PDF из приложения банка либо CSV/XLSX.',
    );
  }

  const known = parseKnownBankPdf(pages, fileName);
  if (known) {
    if (known.diagnostics.recognizedRowCount === 0) {
      throw new Error(
        `Формат ${known.diagnostics.templateLabel} определён, но операции не найдены. Используйте оригинальный PDF из приложения банка.`,
      );
    }
    return known;
  }

  const table: StatementTable = [];
  for (const pdfPage of pages) {
    const items = pdfPage.items;
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
  return { table };
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
