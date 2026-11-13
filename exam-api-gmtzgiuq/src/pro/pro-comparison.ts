/**
 * Comparison table of the Upgrade page, one per venue
 * (`pro_venues.comparison`, task 17):
 *
 *   { groups: [ { title, rows: [ { label, sublabel?, cells: {
 *       <plan code>: { type: 'check' | 'cross' | 'text', text?, subtext? }
 *   } } ] } ] }
 *
 * Cells are keyed by plan `code`: a cell of a code that no plan has is
 * ignored by the page, a plan without a cell shows an empty cell. All text
 * is plain text (the web renders it as text, never as HTML) and is stored
 * as typed (trimmed), not escaped.
 */
export type ComparisonCellType = 'check' | 'cross' | 'text';
export const COMPARISON_CELL_TYPES: readonly ComparisonCellType[] = [
  'check',
  'cross',
  'text',
];

export interface ComparisonCell {
  type: ComparisonCellType;
  text?: string;
  subtext?: string;
}

export interface ComparisonRow {
  label: string;
  sublabel?: string;
  cells: Record<string, ComparisonCell>;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

export interface ProComparison {
  groups: ComparisonGroup[];
}

export const MAX_COMPARISON_GROUPS = 20;
export const MAX_COMPARISON_ROWS = 50;
export const MAX_COMPARISON_CELLS = 20;
export const MAX_GROUP_TITLE_LENGTH = 100;
export const MAX_ROW_LABEL_LENGTH = 150;
export const MAX_ROW_SUBLABEL_LENGTH = 200;
export const MAX_CELL_TEXT_LENGTH = 50;
export const MAX_CELL_SUBTEXT_LENGTH = 100;

/** Plan code / venue key: lower-case letters, digits, - and _ (≤ 30). */
export const PRO_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,29}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Optional text: undefined/null → ok; otherwise a string within `max`
 * characters after trimming. Returns an error message or null.
 */
function checkOptionalText(
  value: unknown,
  max: number,
  what: string,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${what}ต้องเป็นข้อความ`;
  if (value.trim().length > max) {
    return `${what}ยาวได้ไม่เกิน ${max} ตัวอักษร`;
  }
  return null;
}

/**
 * Strict check of a comparison table sent by an admin (null is allowed =
 * no table). Returns the Thai error message (with the group/row number), or
 * null when valid.
 */
export function checkComparison(value: unknown): string | null {
  if (value === null) return null;
  if (!isPlainObject(value) || !Array.isArray(value.groups)) {
    return 'ตารางเปรียบเทียบต้องเป็น object ที่มี groups เป็น array';
  }
  if (value.groups.length > MAX_COMPARISON_GROUPS) {
    return `ตารางเปรียบเทียบมีได้ไม่เกิน ${MAX_COMPARISON_GROUPS} กลุ่ม`;
  }
  for (const [g, group] of (value.groups as unknown[]).entries()) {
    const at = `ตารางเปรียบเทียบ กลุ่มที่ ${g + 1}: `;
    if (!isPlainObject(group)) return `${at}ข้อมูลกลุ่มไม่ถูกต้อง`;
    if (typeof group.title !== 'string') return `${at}ชื่อกลุ่มต้องเป็นข้อความ`;
    if (group.title.trim().length > MAX_GROUP_TITLE_LENGTH) {
      return `${at}ชื่อกลุ่มยาวได้ไม่เกิน ${MAX_GROUP_TITLE_LENGTH} ตัวอักษร`;
    }
    if (!Array.isArray(group.rows)) return `${at}rows ต้องเป็น array`;
    if (group.rows.length > MAX_COMPARISON_ROWS) {
      return `${at}มีแถวได้ไม่เกิน ${MAX_COMPARISON_ROWS} แถว`;
    }
    for (const [r, row] of (group.rows as unknown[]).entries()) {
      const error = checkRow(row, `${at}แถวที่ ${r + 1}: `);
      if (error) return error;
    }
  }
  return null;
}

function checkRow(row: unknown, at: string): string | null {
  if (!isPlainObject(row)) return `${at}ข้อมูลแถวไม่ถูกต้อง`;
  if (typeof row.label !== 'string' || row.label.trim() === '') {
    return `${at}กรุณาใส่ชื่อแถว`;
  }
  if (row.label.trim().length > MAX_ROW_LABEL_LENGTH) {
    return `${at}ชื่อแถวยาวได้ไม่เกิน ${MAX_ROW_LABEL_LENGTH} ตัวอักษร`;
  }
  const sublabelError = checkOptionalText(
    row.sublabel,
    MAX_ROW_SUBLABEL_LENGTH,
    `${at}คำอธิบายใต้ชื่อแถว`,
  );
  if (sublabelError) return sublabelError;

  if (row.cells === undefined || row.cells === null) return null;
  if (!isPlainObject(row.cells)) return `${at}cells ต้องเป็น object`;
  const codes = Object.keys(row.cells);
  if (codes.length > MAX_COMPARISON_CELLS) {
    return `${at}มีช่องได้ไม่เกิน ${MAX_COMPARISON_CELLS} ช่อง`;
  }
  for (const code of codes) {
    if (!PRO_CODE_PATTERN.test(code)) {
      return `${at}รหัสแพ็กเกจของช่อง "${code.slice(0, 40)}" ไม่ถูกต้อง`;
    }
    const cellAt = `${at}ช่อง ${code}: `;
    const cell = row.cells[code];
    if (!isPlainObject(cell)) return `${cellAt}ข้อมูลช่องไม่ถูกต้อง`;
    if (!COMPARISON_CELL_TYPES.includes(cell.type as ComparisonCellType)) {
      return `${cellAt}type ต้องเป็น check, cross หรือ text`;
    }
    const textError =
      checkOptionalText(cell.text, MAX_CELL_TEXT_LENGTH, `${cellAt}ข้อความ`) ??
      checkOptionalText(
        cell.subtext,
        MAX_CELL_SUBTEXT_LENGTH,
        `${cellAt}ข้อความรอง`,
      );
    if (textError) return textError;
  }
  return null;
}

/** Trimmed non-empty string within `max`, else undefined. */
function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text !== '' && text.length <= max ? text : undefined;
}

/**
 * Shared by the read and write paths: only the known keys, texts trimmed
 * (blank optional texts dropped), limits applied (extra groups/rows/cells
 * dropped), rows without a label and cells with an unknown type skipped.
 */
function build(value: Record<string, unknown>): ProComparison {
  const groups: ComparisonGroup[] = [];
  const list: unknown[] = Array.isArray(value.groups) ? value.groups : [];
  for (const item of list.slice(0, MAX_COMPARISON_GROUPS)) {
    if (!isPlainObject(item)) continue;
    const title =
      typeof item.title === 'string'
        ? item.title.trim().slice(0, MAX_GROUP_TITLE_LENGTH)
        : '';
    const rows: ComparisonRow[] = [];
    const rowList: unknown[] = Array.isArray(item.rows) ? item.rows : [];
    for (const rowItem of rowList.slice(0, MAX_COMPARISON_ROWS)) {
      const row = buildRow(rowItem);
      if (row) rows.push(row);
    }
    groups.push({ title, rows });
  }
  return { groups };
}

function buildRow(item: unknown): ComparisonRow | null {
  if (!isPlainObject(item)) return null;
  const label = cleanText(item.label, MAX_ROW_LABEL_LENGTH);
  if (!label) return null;
  const row: ComparisonRow = { label, cells: {} };
  const sublabel = cleanText(item.sublabel, MAX_ROW_SUBLABEL_LENGTH);
  if (sublabel) row.sublabel = sublabel;
  if (isPlainObject(item.cells)) {
    for (const code of Object.keys(item.cells).slice(0, MAX_COMPARISON_CELLS)) {
      if (!PRO_CODE_PATTERN.test(code)) continue;
      const raw = item.cells[code];
      if (!isPlainObject(raw)) continue;
      const type = raw.type as ComparisonCellType;
      if (!COMPARISON_CELL_TYPES.includes(type)) continue;
      const cell: ComparisonCell = { type };
      const text = cleanText(raw.text, MAX_CELL_TEXT_LENGTH);
      if (text) cell.text = text;
      const subtext = cleanText(raw.subtext, MAX_CELL_SUBTEXT_LENGTH);
      if (subtext) cell.subtext = subtext;
      row.cells[code] = cell;
    }
  }
  return row;
}

/** The value to store from PUT (already checked by the DTO); null stays null. */
export function prepareComparison(value: unknown): ProComparison | null {
  return isPlainObject(value) ? build(value) : null;
}

/**
 * Read `pro_venues.comparison` tolerantly (a JSON string from MariaDB raw
 * queries is parsed; null/malformed → null; invalid parts skipped).
 */
export function normalizeStoredComparison(
  value: unknown,
): ProComparison | null {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  return isPlainObject(data) ? build(data) : null;
}

/**
 * The table for the public Upgrade page: only the cells of the given plan
 * codes (visible plans), so hidden or deleted plans never show.
 */
export function comparisonForPlans(
  comparison: ProComparison | null,
  codes: string[],
): ProComparison | null {
  if (!comparison) return null;
  const allowed = new Set(codes);
  return {
    groups: comparison.groups.map((group) => ({
      title: group.title,
      rows: group.rows.map((row) => ({
        ...row,
        cells: Object.fromEntries(
          Object.entries(row.cells).filter(([code]) => allowed.has(code)),
        ),
      })),
    })),
  };
}
