/**
 * 鉴权路由 + JWT plugin。
 * MVP：邮箱+密码（任意密码）登录直接签发 JWT，便于联调；生产替换为真实账号体系。
 */
import { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from './config.js';
import type { TenantCtx } from './tenant.js';

export async function registerAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, { secret: config.jwt.secret });

  // 把当前用户挂到 request.tenant
  app.decorateRequest('tenant', null);

  app.addHook('onRequest', async (req, reply) => {
    // 白名单
    if (
      req.url.startsWith('/api/auth/login') ||
      req.url.startsWith('/api/health') ||
      req.url.startsWith('/ws/')
    ) return;
    try {
      const payload = await req.jwtVerify<TenantCtx>();
      (req as any).tenant = payload;
    } catch {
      reply.code(401).send({ message: '未登录或登录已过期' });
    }
  });

  /* ===== Routes ===== */

  app.post<{ Body: { email: string; password: string } }>(
    '/api/auth/login',
    async (req, reply) => {
      const { email } = req.body ?? ({} as any);
      // mock 校验：任何密码通过；email 决定身份（如果为空，用 dev 默认）
      const u = config.devUser;
      const tenant: TenantCtx = {
        orgId: u.orgId,
        orgName: u.orgName,
        userId: u.userId,
        name: u.name,
        email: email || u.email,
        role: u.role,
      };
      const token = app.jwt.sign(tenant);
      return reply.send({
        token,
        user: {
          id: tenant.userId,
          name: tenant.name,
          email: tenant.email,
          role: tenant.role,
          organization: tenant.orgName,
          joinedAt: new Date().toISOString().slice(0, 10),
        },
      });
    },
  );

  app.get('/api/auth/me', async (req) => {
    const t = (req as any).tenant as TenantCtx;
    return {
      id: t.userId,
      name: t.name,
      email: t.email,
      role: t.role,
      organization: t.orgName,
      joinedAt: '2025-09-12',
    };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    // JWT 无状态，前端清掉 token 即可
    reply.code(204).send();
  });
}

/* TS 增强 */
declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantCtx;
  }
}
