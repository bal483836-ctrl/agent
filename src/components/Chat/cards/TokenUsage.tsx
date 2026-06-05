import { Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { TokenUsage as TU } from '@/types';

interface Props {
  usage: TU;
  /** 紧凑模式：仅显示 total */
  compact?: boolean;
}

export default function TokenUsage({ usage, compact }: Props) {
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
        {compact ? (
          <span>
            本次消耗 <span className="qc-token-num">{fmt(usage.total)}</span> tokens
          </span>
        ) : (
          <span>
            本次消耗 <span className="qc-token-num">{fmt(usage.total)}</span> tokens
            <span style={{ margin: '0 6px', color: '#cbd5e1' }}>|</span>
            prompt <b>{fmt(usage.prompt)}</b>
            <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
            completion <b>{fmt(usage.completion)}</b>
            {seconds && (
              <>
                <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
                耗时 <b>{seconds}s</b>
              </>
            )}
          </span>
        )}
      </div>
    </Tooltip>
  );
}
