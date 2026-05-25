import type { FastifyPluginAsync } from 'fastify';
import { getDb, users, eq, count } from '@arp/db';
import { randomUUID, pbkdf2Sync, randomBytes } from 'crypto';
import { z } from 'zod';

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, storedHash] = passwordHash.split(':');
  if (!salt || !storedHash) return false;
  const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register User
  fastify.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const db = getDb();

    // Check if user already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (existing) {
      return reply.code(400).send({ success: false, error: 'Email already registered' });
    }

    const passwordHash = hashPassword(body.password);
    const [newUser] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        role: 'developer',
      })
      .returning();

    const token = fastify.jwt.sign({ userId: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role });

    return reply.status(201).send({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
    });
  });

  // Login User
  fastify.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (!user || !user.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ success: false, error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return reply.code(403).send({ success: false, error: 'User account is deactivated' });
    }

    const token = fastify.jwt.sign({ userId: user.id, email: user.email, name: user.name, role: user.role });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });

  // Bootstrap: create the first admin account. No-op if any user already exists.
  fastify.post('/bootstrap', async (request, reply) => {
    const BootstrapSchema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      password: z.string().min(8),
    });

    const body = BootstrapSchema.parse(request.body);
    const db = getDb();

    const [existingCount] = await db.select({ count: count() }).from(users);
    if (Number(existingCount?.count ?? 1) > 0) {
      return reply.code(409).send({
        success: false,
        error: 'Bootstrap is disabled: users already exist. Use /login instead.',
      });
    }

    const passwordHash = hashPassword(body.password);
    const [adminUser] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        role: 'admin',
      })
      .returning();

    const token = fastify.jwt.sign({ userId: adminUser.id, email: adminUser.email, name: adminUser.name, role: 'admin' });

    return reply.status(201).send({
      success: true,
      message: 'Admin account created successfully.',
      token,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: 'admin' as const,
      },
    });
  });
};
