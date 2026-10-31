'use client';

import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexRendererProps {
  content: string;
  className?: string;
}

function renderLatexInHtml(html: string): string {
  // Replace $$...$$ (block math) first
  let result = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<span class="text-red-500">[LaTeX Error]</span>`;
    }
  });

  // Replace $...$ (inline math) — avoid matching already-rendered KaTeX spans
  result = result.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="text-red-500">[LaTeX Error]</span>`;
    }
  });

  return result;
}

// ── Markdown tables ───────────────────────────────────────
// บล็อกที่บรรทัดแรกขึ้นต้นด้วย `|` และบรรทัดที่สองเป็นเส้นคั่น (`|---|:--:|`) → <table>
// HTML ที่สร้างต้องไม่มี newline เพราะคอนเทนเนอร์เป็น white-space: pre-wrap

type Align = 'left' | 'center' | 'right' | null;

const ESCAPED_PIPE = '\u0000PIPE\u0000';
const TABLE_TOKEN = (i: number) => `\u0000MDTABLE${i}\u0000`;
const SEPARATOR_CELL = /^:?-+:?$/;

function splitRow(line: string): string[] {
  let row = line.trim().replace(/\\\|/g, ESCAPED_PIPE);
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim().split(ESCAPED_PIPE).join('|'));
}

function parseSeparator(line: string): Align[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.includes('-')) return null;
  const cells = splitRow(trimmed);
  if (cells.length === 0 || !cells.every((c) => SEPARATOR_CELL.test(c.replace(/\s+/g, '')))) {
    return null;
  }
  return cells.map((c) => {
    const s = c.replace(/\s+/g, '');
    const left = s.startsWith(':');
    const right = s.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

const ALIGN_CLASS: Record<string, string> = {
  left: ' text-left',
  center: ' text-center',
  right: ' text-right',
};

const TH_CLASS =
  'border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 px-3 py-2 font-semibold text-gray-900 dark:text-gray-100';
const TD_CLASS =
  'border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-800 dark:text-gray-200';

function renderTable(header: string[], aligns: Align[], rows: string[][]): string {
  const cols = header.length;
  const cell = (tag: 'th' | 'td', content: string, i: number) => {
    const a = aligns[i];
    const align = a ? ALIGN_CLASS[a] : tag === 'th' ? ' text-left' : '';
    const cls = (tag === 'th' ? TH_CLASS : TD_CLASS) + align;
    return `<${tag} class="${cls}">${renderLatexInHtml(content)}</${tag}>`;
  };
  const head = header.map((h, i) => cell('th', h, i)).join('');
  const body = rows
    .map((r) => {
      const padded = Array.from({ length: cols }, (_, i) => r[i] ?? '');
      return `<tr>${padded.map((c, i) => cell('td', c, i)).join('')}</tr>`;
    })
    .join('');
  return (
    `<div class="overflow-x-auto my-2 max-w-full">` +
    `<table class="border-collapse border border-gray-300 dark:border-gray-600 text-sm">` +
    `<thead><tr>${head}</tr></thead>` +
    (body ? `<tbody>${body}</tbody>` : '') +
    `</table></div>`
  );
}

/** แทนตาราง Markdown ด้วย token แล้วคืน HTML ของแต่ละตาราง (เนื้อหาส่วนอื่นไม่ถูกแตะ) */
function extractMarkdownTables(content: string): { text: string; tables: string[] } {
  if (!content.includes('|')) return { text: content, tables: [] };
  const lines = content.split('\n');
  const out: string[] = [];
  const tables: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.trim().startsWith('|') && next !== undefined) {
      const aligns = parseSeparator(next);
      const header = aligns ? splitRow(line) : null;
      if (aligns && header && header.length === aligns.length) {
        const rows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|')) {
          rows.push(splitRow(lines[j]));
          j++;
        }
        tables.push(renderTable(header, aligns, rows));
        // token แทนทั้งบล็อก และต่อบรรทัดถัดไปไว้บรรทัดเดียวกัน (ตารางเป็น block อยู่แล้ว)
        // กัน newline หลังตารางกลายเป็นบรรทัดว่างเกินมา
        const token = TABLE_TOKEN(tables.length - 1);
        if (j < lines.length) {
          out.push(token + lines[j]);
          j++;
        } else {
          out.push(token);
        }
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }

  return { text: out.join('\n'), tables };
}

function renderRichContent(content: string): string {
  const { text, tables } = extractMarkdownTables(content);
  let html = renderLatexInHtml(text);
  tables.forEach((table, i) => {
    html = html.split(TABLE_TOKEN(i)).join(table);
  });
  return html;
}

export default function LatexRenderer({ content, className = '' }: LatexRendererProps) {
  const renderedHtml = useMemo(() => renderRichContent(content), [content]);

  return (
    <div
      className={className}
      style={{ whiteSpace: 'pre-wrap' }}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
