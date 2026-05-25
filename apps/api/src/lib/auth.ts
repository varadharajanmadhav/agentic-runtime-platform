import type { FastifyReply, FastifyRequest } from 'fastify';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';

/**
 * Fastify preHandler hook — rejects requests from non-admin users with 403.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if ((request.user as any)?.role !== 'admin') {
    return reply.code(403).send({
      success: false,
      error: 'Forbidden: admin access required',
    });
  }
}

/**
 * Resolves the effective workspace directory for the current user.
 *
 * - Admins: pass-through whatever directory was requested.
 * - All other roles: jail to `<WORKSPACE_BASE_DIR>/<userId>/` regardless
 *   of what the client sent. The directory is created if it does not exist.
 */
export async function resolveWorkspaceDir(
  user: { userId: string; role?: string } | undefined,
  requestedDir: string | undefined,
): Promise<string> {
  const isAdmin = user?.role === 'admin';

  if (isAdmin && requestedDir) {
    return requestedDir;
  }

  // Non-admins are jailed to their own isolated workspace sub-directory.
  const baseDir = process.env.WORKSPACE_BASE_DIR
    ? resolve(process.env.WORKSPACE_BASE_DIR)
    : resolve('./workspaces');
  const userDir = resolve(baseDir, user?.userId ?? 'anonymous');

  await mkdir(userDir, { recursive: true });

  return userDir;
}
