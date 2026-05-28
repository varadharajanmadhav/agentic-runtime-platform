import type { FastifyPluginAsync } from 'fastify';
import { getDb, users, eq, count } from '@arp/db';
import { randomUUID, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getRedisClient } from '../lib/redis.js';
import { AUTH } from '../config/constants.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(AUTH.PASSWORD_MIN_LENGTH, `Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, AUTH.PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, storedHash] = passwordHash.split(':');
  if (!salt || !storedHash) return false;
  const hash = pbkdf2Sync(password, salt, AUTH.PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

export async function blacklistToken(jti: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(`${AUTH.BLACKLIST_PREFIX}${jti}`, '1', 'EX', AUTH.TOKEN_TTL_SECONDS);
  } catch (err) {
    console.error('[Auth] Failed to blacklist token:', err);
  }
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const val = await redis.get(`${AUTH.BLACKLIST_PREFIX}${jti}`);
    return val !== null;
  } catch {
    return false;
  }
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register User
  fastify.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const db = getDb();

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

    const jti = randomUUID();
    const token = fastify.jwt.sign(
      { userId: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, jti },
      { expiresIn: AUTH.TOKEN_TTL },
    );

    return reply.status(201).send({
      success: true,
      token,
      user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
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

    const jti = randomUUID();
    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role, jti },
      { expiresIn: AUTH.TOKEN_TTL },
    );

    return { success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  // Logout — blacklists the current token so it can't be reused
  fastify.post('/logout', async (request, reply) => {
    try {
      await request.jwtVerify();
      const payload = request.user as any;
      if (payload?.jti) {
        await blacklistToken(payload.jti);
      }
    } catch {
      // Token may already be invalid — still return success
    }
    return { success: true };
  });

  // Current user info
  fastify.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
    return { success: true, user: request.user };
  });

  // Bootstrap: create the first admin account. No-op if any user already exists.
  fastify.post('/bootstrap', async (request, reply) => {
    const BootstrapSchema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      password: z.string().min(AUTH.PASSWORD_MIN_LENGTH, `Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`),
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

    const jti = randomUUID();
    const token = fastify.jwt.sign(
      { userId: adminUser.id, email: adminUser.email, name: adminUser.name, role: 'admin', jti },
      { expiresIn: AUTH.TOKEN_TTL },
    );

    return reply.status(201).send({
      success: true,
      message: 'Admin account created successfully.',
      token,
      user: { id: adminUser.id, email: adminUser.email, name: adminUser.name, role: 'admin' as const },
    });
  });
};
