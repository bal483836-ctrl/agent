import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from './uploader.js';

describe('SKILL.md frontmatter 解析', () => {
  it('基本 key: value', () => {
    const fm = parseFrontmatter('---\nname: foo\ncategory: bar\n---\nbody');
    expect(fm.name).toBe('foo');
    expect(fm.category).toBe('bar');
  });

  it('折叠多行 description: > 用空格连接', () => {
    const raw = [
      '---',
      'name: q-validation',
      'description: >',
      '  第一行内容。',
      '  第二行内容。',
      '---',
      'body',
    ].join('\n');
    const fm = parseFrontmatter(raw);
    expect(fm.name).toBe('q-validation');
    expect(fm.description).toBe('第一行内容。 第二行内容。');
  });

  it('字面多行 description: | 保留换行', () => {
    const raw = '---\ndescription: |\n  a\n  b\n---\n';
    const fm = parseFrontmatter(raw);
    expect(fm.description).toBe('a\n  b');
  });

  it('无 frontmatter 返回空对象', () => {
    expect(parseFrontmatter('hello world')).toEqual({});
  });
});
