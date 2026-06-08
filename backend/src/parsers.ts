/**
 * 文件内容解析器集合。
 *
 * 支持格式：
 *   .txt .md .json .csv .tsv .log .yaml .yml .xml .html .htm .py .js .ts .sql .ini  → 直接 UTF-8
 *   .pdf    → pdf-parse
 *   .docx   → mammoth (extractRawText)
 *   .xlsx .xls → SheetJS（前 N 行 + 列头）
 *   其他   → 仅元信息
 *
 * 所有解析都受 maxBytes 限制（默认 8KB），避免一份 PDF 把 prompt 撑爆。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const TEXT_EXT = new Set([
  '.txt', '.md', '.csv', '.tsv', '.json', '.log', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.py', '.js', '.ts', '.sql', '.ini', '.conf',
]);

export interface ParseResult {
  /** 提取出来的纯文本（截断后） */
  text: string;
  /** 类型简述，写到提示词里方便模型理解 */
  kind: string;
  /** 是否被截断 */
  truncated: boolean;
  /** 原始大小（字节） */
  totalBytes: number;
}

/**
 * 主入口：按扩展名分发。返回可注入 LLM prompt 的文本片段 + 元信息。
 *
 * @param fsPath 物理路径
 * @param name   原文件名（决定扩展名）
 * @param maxBytes 单文件最多保留的字符数（按 UTF-8 bytes 估）
 */
export async function parseFile(
  fsPath: string,
  name: string,
  maxBytes = 8 * 1024,
): Promise<ParseResult | null> {
  const ext = path.extname(name).toLowerCase();
  try {
    if (TEXT_EXT.has(ext)) return await parseText(fsPath, ext, maxBytes);
    if (ext === '.pdf') return await parsePdf(fsPath, maxBytes);
    if (ext === '.docx') return await parseDocx(fsPath, maxBytes);
    if (ext === '.xlsx' || ext === '.xls') return await parseSpreadsheet(fsPath, ext, maxBytes);
    // 其他：仅返回元信息
    const stat = await fs.stat(fsPath);
    return {
      text: '',
      kind: ext ? `binary (${ext})` : 'binary',
      truncated: false,
      totalBytes: stat.size,
    };
  } catch (e) {
    return {
      text: `[解析失败：${(e as Error).message}]`,
      kind: ext || 'unknown',
      truncated: false,
      totalBytes: 0,
    };
  }
}

/* ===== 纯文本 ===== */
async function parseText(fsPath: string, ext: string, maxBytes: number): Promise<ParseResult> {
  const stat = await fs.stat(fsPath);
  const fh = await fs.open(fsPath, 'r');
  const len = Math.min(stat.size, maxBytes);
  const buf = Buffer.alloc(len);
  await fh.read(buf, 0, len, 0);
  await fh.close();
  let text = buf.toString('utf-8');
  if (stat.size > len) text += `\n... [truncated, total ${stat.size}B]`;
  return {
    text,
    kind: kindForExt(ext),
    truncated: stat.size > len,
    totalBytes: stat.size,
  };
}

/* ===== PDF ===== */
async function parsePdf(fsPath: string, maxBytes: number): Promise<ParseResult> {
  // 动态 import 避免启动时加载 pdf 解析器；不同版本导出形式不同，兼容处理
  const mod: any = await import('pdf-parse');
  const pdfParse = mod.default ?? mod.pdf ?? mod;
  const buf = await fs.readFile(fsPath);
  const data = await pdfParse(buf);
  const truncated = data.text.length > maxBytes;
  const text = truncated ? data.text.slice(0, maxBytes) + `\n... [truncated, full ${data.text.length} chars across ${data.numpages} pages]` : data.text;
  return {
    text,
    kind: `pdf (${data.numpages} pages)`,
    truncated,
    totalBytes: buf.length,
  };
}

/* ===== Word (.docx) ===== */
async function parseDocx(fsPath: string, maxBytes: number): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: fsPath });
  const truncated = result.value.length > maxBytes;
  const text = truncated ? result.value.slice(0, maxBytes) + '\n... [truncated]' : result.value;
  const stat = await fs.stat(fsPath);
  return {
    text,
    kind: 'docx',
    truncated,
    totalBytes: stat.size,
  };
}

/* ===== Excel ===== */
async function parseSpreadsheet(fsPath: string, ext: string, maxBytes: number): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.readFile(fsPath, { cellDates: true });
  const lines: string[] = [];
  for (const sheetName of wb.SheetNames) {
    lines.push(`# Sheet: ${sheetName}`);
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
    // 最多导出前 50 行 + 列头
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      lines.push(rows[i].map((c: any) => String(c)).join('\t'));
    }
    if (rows.length > 50) lines.push(`... (剩余 ${rows.length - 50} 行省略)`);
    lines.push('');
  }
  const full = lines.join('\n');
  const truncated = full.length > maxBytes;
  const text = truncated ? full.slice(0, maxBytes) + '\n... [truncated]' : full;
  const stat = await fs.stat(fsPath);
  return {
    text,
    kind: ext === '.xlsx' ? 'xlsx' : 'xls',
    truncated,
    totalBytes: stat.size,
  };
}

function kindForExt(ext: string): string {
  switch (ext) {
    case '.csv': return 'csv';
    case '.tsv': return 'tsv';
    case '.json': return 'json';
    case '.md': return 'markdown';
    case '.yaml': case '.yml': return 'yaml';
    case '.xml': return 'xml';
    case '.html': case '.htm': return 'html';
    default: return 'text';
  }
}

/** 提供给前端 UI 的"可解析"扩展名集合 */
export function supportedExts(): string[] {
  return [...TEXT_EXT, '.pdf', '.docx', '.xlsx', '.xls'];
}
