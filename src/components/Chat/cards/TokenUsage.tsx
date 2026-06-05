import { Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { TokenUsage as TU } from '@/types';

/**
 * AI 输出底部的消耗胶囊。
 *  - 主体只显示「本次消耗 X tokens」，保持简洁
 *  - 鼠标悬停时通过 Tooltip 展示 prompt / completion / 耗时 等明细
 */
interface Props {
  usage: TU;
}

export default function TokenUsage({ usage }: Props) {
  const fmt = (n: number) => n.toLocaleString('en-US');
  const seconds = usage.durationMs ? (usage.durationMs / 1000).toFixed(1) : null;

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>prompt：{fmt(usage.prompt)}</div>
          <div>completion：{fmt(usage.completion)}</div>
          <div>合计：{fmt(usage.total)}</div>
          {seconds && <div>耗时：{seconds}s</div>}
        </div>
      }
    >
      <div className="qc-token-usage">
        <ThunderboltOutlined style={{ color: '#2563eb' }} />
        <span>
          本次消耗 <span className="qc-token-num">{fmt(usage.total)}</span> tokens
        </span>
      </div>
    </Tooltip>
  );
}
