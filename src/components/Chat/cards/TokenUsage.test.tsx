import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TokenUsage from './TokenUsage';

describe('TokenUsage', () => {
  it('显示总 tokens 数（格式化）', () => {
    render(<TokenUsage usage={{ prompt: 1200, completion: 350, total: 1550 }} />);
    expect(screen.getByText(/1,550/)).toBeTruthy();
    expect(screen.getByText(/本次消耗/)).toBeTruthy();
  });

  it('数字超过千位有逗号', () => {
    render(<TokenUsage usage={{ prompt: 1, completion: 1, total: 1234567 }} />);
    expect(screen.getByText(/1,234,567/)).toBeTruthy();
  });
});
