import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { startIndexing, getIndexingStatus } from '../agents/context/indexer.js';
import { watchWorkspace } from '../lib/watcher.js';
import { z } from 'zod';
import { glob } from 'glob';
import { readFile, writeFile } from 'fs/promises';
import { resolve, relative, isAbsolute } from 'path';
import { resolveWorkspaceDir } from '../lib/auth.js';
import { getDb, workspaceSymbols, callEdges, eq } from '@arp/db';

export const contextRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/context/index
  fastify.post('/index', async (request, reply) => {
    const bodySchema = z.object({
      workspaceDir: z.string(),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid workspaceDir' });
    }

    const { workspaceDir: requestedDir } = parsed.data;
    const workspaceDir = await resolveWorkspaceDir(request.user as any, requestedDir);

    // H-8: Block concurrent indexing runs to prevent DB/Qdrant races
    const status = await getIndexingStatus(workspaceDir);
    if (status.status === 'indexing') {
      return reply.code(409).send({
        success: false,
        error: 'Indexing is already in progress for this workspace.',
      });
    }

    // Trigger indexing in background
    startIndexing(workspaceDir);

    // Ensure file changes in this workspace are auto-indexed from now on
    watchWorkspace(workspaceDir);

    return { success: true, message: 'Workspace indexing started' };
  });

  // GET /api/context/status
  fastify.get('/status', async (request, reply) => {
    const querySchema = z.object({
      workspaceDir: z.string(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Missing or invalid workspaceDir' });
    }

    const { workspaceDir } = parsed.data;
    const progress = await getIndexingStatus(workspaceDir);

    return { success: true, data: progress };
  });

  // GET /api/context/files
  fastify.get('/files', async (request, reply) => {
    const querySchema = z.object({
      workspaceDir: z.string(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Missing or invalid workspaceDir' });
    }

    const { workspaceDir: requestedDir } = parsed.data;
    const workspaceDir = await resolveWorkspaceDir(request.user as any, requestedDir);
    try {
      const files = await glob('**/*.{ts,tsx,js,jsx,py,go,json,md,html,css,txt,cs,cshtml,aspx,ascx}', {
        cwd: workspaceDir,
        absolute: false,
        ignore: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.turbo/**',
          '**/.next/**',
          '**/out/**',
        ],
      });
      return { success: true, data: files };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message || String(err) });
    }
  });

  // GET /api/context/file-content
  fastify.get('/file-content', async (request, reply) => {
    const querySchema = z.object({
      workspaceDir: z.string(),
      path: z.string(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Missing or invalid parameters' });
    }

    const { workspaceDir: requestedDir, path } = parsed.data;
    const workspaceDir = await resolveWorkspaceDir(request.user as any, requestedDir);
    try {
      const absolutePath = resolve(workspaceDir, path);
      const rel = relative(workspaceDir, absolutePath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return reply.code(400).send({ success: false, error: 'Path traversal detected' });
      }

      const content = await readFile(absolutePath, 'utf8');
      return { success: true, data: { content } };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message || String(err) });
    }
  });

  // POST /api/context/file-save
  fastify.post('/file-save', async (request, reply) => {
    const bodySchema = z.object({
      workspaceDir: z.string(),
      path: z.string(),
      content: z.string(),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Missing or invalid parameters' });
    }

    const { workspaceDir: requestedDir, path, content } = parsed.data;
    const workspaceDir = await resolveWorkspaceDir(request.user as any, requestedDir);
    try {
      const absolutePath = resolve(workspaceDir, path);
      const rel = relative(workspaceDir, absolutePath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return reply.code(400).send({ success: false, error: 'Path traversal detected' });
      }

      await writeFile(absolutePath, content, 'utf8');
      return { success: true, message: 'File saved successfully' };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message || String(err) });
    }
  });

  // GET /api/context/call-graph
  fastify.get('/call-graph', async (request, reply) => {
    const querySchema = z.object({
      workspaceDir: z.string(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Missing or invalid workspaceDir' });
    }

    const { workspaceDir: requestedDir } = parsed.data;
    const workspaceDir = await resolveWorkspaceDir(request.user as any, requestedDir);
    
    try {
      const db = getDb();
      // Fetch all call edges
      const edges = await db
        .select()
        .from(callEdges)
        .where(eq(callEdges.workspaceDir, workspaceDir));
        
      // Fetch all symbols to build node info
      const symbols = await db
        .select({
          id: workspaceSymbols.id,
          name: workspaceSymbols.name,
          symbolType: workspaceSymbols.symbolType,
          filePath: workspaceSymbols.filePath,
        })
        .from(workspaceSymbols)
        .where(eq(workspaceSymbols.workspaceDir, workspaceDir));
        
      return {
        success: true,
        data: {
          nodes: symbols,
          edges: edges,
        }
      };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message || String(err) });
    }
  });
};
