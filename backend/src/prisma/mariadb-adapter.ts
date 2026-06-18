import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * Build the Prisma 7 MariaDB driver adapter from a `mysql://` connection URL.
 *
 * Parses the URL into an explicit mariadb pool config rather than handing the
 * raw string to the adapter so we can set `allowPublicKeyRetrieval`: MySQL 8.4
 * authenticates with `caching_sha2_password` by default, and over a non-TLS
 * connection the mariadb driver must be allowed to fetch the server's RSA
 * public key to complete the handshake — without it every query fails with
 * `ER_CANNOT_RETRIEVE_RSA_KEY` / a pool-acquire timeout. See memory:
 * prisma7-setup.
 */
export function buildMariaDbAdapter(databaseUrl: string): PrismaMariaDb {
  const url = new URL(databaseUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    allowPublicKeyRetrieval: true,
  });
}
