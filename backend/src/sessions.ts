import { FastifyInstance } from 'fastify';
import { createSession, listSessions, removeSession, renameSession } from './store.js';
import type { TenantCtx } from './tenant.js';

export async function registerSessions(app: FastifyInstance) {
  app.get('/api/sessions', async (req) => {
    return listSessions((req as any).tenant as TenantCtx);
  });

  app.post<{ Body: { title?: string } }>('/api/sessions', async (req) => {
    return createSession((req as any).tenant, req.body?.title || '新对话');
  });

  app.patch<{ Params: { id: string }; Body: { title: string } }>(
    '/api/sessions/:id',
    async (req) => {
      return renameSession((req as any).tenant, req.params.id, req.body.title);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    await removeSession((req as any).tenant, req.params.id);
    reply.code(204).send();
  });
}
