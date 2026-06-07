/**
 * Gateway 管理器 —— 按需为每个 (orgId, userId) 实例化一个独立 Gateway。
 *
 * 架构对齐：
 *  - 组织间：物理隔离（独立 VM / K8s namespace），由部署层完成
 *  - 组织内每用户：本进程持有一个 Gateway 对象，封装独立的：
 *      · LLM 客户端
 *      · 会话/消息/工作区状态
 *      · 数据目录
 *      · 空闲生命周期（30 分钟无活动自动回收）
 *
 *  - 单进程承载多个 Gateway 仅作为 MVP 阶段实现；
 *    生产部署用 K8s pod-per-user，把当前 Gateway 类的全部职责放到独立容器即可。
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { ensureTenantDirs, type TenantCtx } from './tenant.js';

export class Gateway {
  readonly orgId: string;
  readonly orgName: string;
  readonly userId: string;
  readonly userName: string;
  readonly createdAt: Date;
  lastActiveAt: Date;

  /** 该 gateway 独占的 LLM 客户端（独立用量统计与重试栈） */
  readonly llm: Anthropic;

  constructor(ctx: TenantCtx) {
    this.orgId = ctx.orgId;
    this.orgName = ctx.orgName;
    this.userId = ctx.userId;
    this.userName = ctx.name;
    this.createdAt = new Date();
    this.lastActiveAt = new Date();
    this.llm = new Anthropic({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    });
  }

  touch() { this.lastActiveAt = new Date(); }

  get key(): string {
    return `${this.orgId}:${this.userId}`;
  }
}

class GatewayManager {
  private instances = new Map<string, Gateway>();
  /** 空闲多久后回收一个 gateway（默认 30 分钟） */
  private idleTtlMs = 30 * 60 * 1000;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  /** 为请求拿到（或按需创建）当前用户的 gateway */
  async getFor(ctx: TenantCtx): Promise<Gateway> {
    const key = `${ctx.orgId}:${ctx.userId}`;
    let g = this.instances.get(key);
    if (!g) {
      // 首次接到该用户请求 → 初始化 gateway，挂在内存中
      await ensureTenantDirs(ctx);
      g = new Gateway(ctx);
      this.instances.set(key, g);
      console.log(`[gateway] +spawn ${key} (total=${this.instances.size})`);
    }
    g.touch();
    return g;
  }

  /** 列出当前活跃 gateway（admin 调试用） */
  list(): { key: string; createdAt: string; lastActiveAt: string; orgId: string; userId: string }[] {
    return Array.from(this.instances.values()).map((g) => ({
      key: g.key,
      createdAt: g.createdAt.toISOString(),
      lastActiveAt: g.lastActiveAt.toISOString(),
      orgId: g.orgId, userId: g.userId,
    }));
  }

  /** 主动回收某个 gateway */
  evict(key: string) {
    if (this.instances.delete(key)) console.log(`[gateway] -evict ${key}`);
  }

  /** 启动空闲 GC（每分钟扫一次） */
  startGc() {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, g] of this.instances) {
        if (now - g.lastActiveAt.getTime() > this.idleTtlMs) {
          this.evict(k);
        }
      }
    }, 60 * 1000);
  }
}

export const gatewayManager = new GatewayManager();
gatewayManager.startGc();
