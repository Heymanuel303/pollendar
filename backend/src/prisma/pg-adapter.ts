import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Build the Prisma 7 PostgreSQL driver adapter from a `postgresql://` connection URL.
 *
 * Prisma 7 has no built-in engine connection, so the runtime client (PrismaService)
 * and any standalone script (seed) must supply a driver adapter. The node-postgres
 * adapter takes the connection string directly — unlike the MySQL path, Postgres
 * needs no public-key-retrieval workaround. See memory: prisma7-setup.
 */
export function buildPgAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl });
}
