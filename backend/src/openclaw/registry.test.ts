import { describe, it, expect } from 'vitest';
import { validateManifest } from './registry.js';

describe('skill manifest 校验', () => {
  it('合法 manifest 通过', () => {
    expect(() => validateManifest({
      id: 'my_skill', name: '我的', description: 'd', category: 'c', entry: 'main.py',
    })).not.toThrow();
  });

  it.each(['id', 'name', 'description', 'category', 'entry'])(
    '缺字段 %s 抛错',
    (field) => {
      const base: any = {
        id: 'a', name: 'n', description: 'd', category: 'c', entry: 'main.py',
      };
      delete base[field];
      expect(() => validateManifest(base)).toThrow();
    },
  );

  it('id 含非法字符抛错', () => {
    expect(() => validateManifest({
      id: 'has space', name: 'n', description: 'd', category: 'c', entry: 'main.py',
    })).toThrow(/id/);
  });

  it('id 允许字母数字下划线连字符', () => {
    for (const id of ['abc', 'abc-def', 'abc_def', 'ABC123']) {
      expect(() => validateManifest({
        id, name: 'n', description: 'd', category: 'c', entry: 'main.py',
      })).not.toThrow();
    }
  });

  it('entry 必须 .py 或 .js', () => {
    expect(() => validateManifest({
      id: 'x', name: 'n', description: 'd', category: 'c', entry: 'main.sh',
    })).toThrow(/entry/);
    expect(() => validateManifest({
      id: 'x', name: 'n', description: 'd', category: 'c', entry: 'main.py',
    })).not.toThrow();
    expect(() => validateManifest({
      id: 'x', name: 'n', description: 'd', category: 'c', entry: 'index.js',
    })).not.toThrow();
  });

  it('非对象抛错', () => {
    expect(() => validateManifest(null)).toThrow();
    expect(() => validateManifest('string')).toThrow();
    expect(() => validateManifest(42)).toThrow();
  });
});
