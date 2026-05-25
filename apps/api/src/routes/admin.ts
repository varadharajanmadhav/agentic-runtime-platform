import type { FastifyPluginAsync } from 'fastify';
import { getDb, users, eq } from '@arp/db';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/users — list all users (admin only)
  fastify.get('/users', { preHandler: requireAdmin }, async (_request, reply) => {
    const db = getDb();
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt);

    return reply.send({ success: true, data: allUsers });
  });

  // PATCH /api/admin/users/:id — update role and/or isActive (admin only)
  fastify.patch<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const PatchSchema = z.object({
        role: z.enum(['admin', 'developer', 'reviewer', 'viewer']).optional(),
        isActive: z.boolean().optional(),
      });

      const parsed = PatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.role !== undefined) updates.role = parsed.data.role;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ success: false, error: 'No valid fields to update' });
      }

      const db = getDb();

      // Prevent admin from deactivating or demoting themselves
      if (request.user.userId === request.params.id) {
        if (parsed.data.isActive === false || (parsed.data.role && parsed.data.role !== 'admin')) {
          return reply.code(400).send({
            success: false,
            error: 'You cannot demote or deactivate your own account',
          });
        }
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, request.params.id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          isActive: users.isActive,
        });

      if (!updated) {
        return reply.notFound('User not found');
      }

      return reply.send({ success: true, data: updated });
    },
  );
};
