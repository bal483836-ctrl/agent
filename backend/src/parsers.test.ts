import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseFile, supportedExts } from './parsers.js';

describe('文件解析器', () => {
  it('supportedExts 含主要格式', () => {
    const exts = supportedExts();
    for (const e of ['.txt', '.md', '.csv', '.json', '.pdf', '.docx', '.xlsx']) {
      expect(exts).toContain(e);
    }
  });

  it('解析 .txt 文本', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'a.txt');
    await fs.writeFile(p, 'hello\nworld');
    const r = await parseFile(p, 'a.txt');
    expect(r?.text).toContain('hello');
    expect(r?.kind).toBe('text');
    expect(r?.truncated).toBe(false);
  });

  it('解析 .md 显示 markdown 类型', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'a.md');
    await fs.writeFile(p, '# 标题\n正文');
    const r = await parseFile(p, 'a.md');
    expect(r?.kind).toBe('markdown');
    expect(r?.text).toContain('标题');
  });

  it('解析 .json 整体保留', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'a.json');
    await fs.writeFile(p, '{"k":1}');
    const r = await parseFile(p, 'a.json');
    expect(r?.kind).toBe('json');
    expect(r?.text).toContain('"k"');
  });

  it('解析 .csv 返回 csv 类型', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'a.csv');
    await fs.writeFile(p, 'name,age\nAlice,30');
    const r = await parseFile(p, 'a.csv');
    expect(r?.kind).toBe('csv');
    expect(r?.text).toContain('Alice');
  });

  it('超大文件被截断', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'big.txt');
    const big = 'x'.repeat(20000);
    await fs.writeFile(p, big);
    const r = await parseFile(p, 'big.txt', 1024);
    expect(r?.truncated).toBe(true);
    expect(r?.text.length).toBeLessThanOrEqual(1024 + 100);  // +截断标记
  });

  it('未知扩展名返回 binary 占位', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'a.bin');
    await fs.writeFile(p, Buffer.from([0x00, 0xff]));
    const r = await parseFile(p, 'a.bin');
    expect(r?.text).toBe('');
    expect(r?.kind).toContain('binary');
  });

  it('xlsx 解析返回 sheet 名 + 行数据', async () => {
    const XLSX = await import('xlsx');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qcp-'));
    const p = path.join(tmp, 'data.xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'age'],
      ['Alice', 30],
      ['Bob', 25],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '受试者');
    XLSX.writeFile(wb, p);
    const r = await parseFile(p, 'data.xlsx');
    expect(r?.kind).toBe('xlsx');
    expect(r?.text).toContain('受试者');
    expect(r?.text).toContain('Alice');
  });
});
