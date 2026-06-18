#!/bin/sh
# Production container entrypoint: migrate the schema, then serve the API.
#
# `prisma migrate deploy` applies the committed migrations under prisma/migrations/
# and is idempotent (already-applied migrations are skipped). It is the ONLY safe
# migration command in production. Never run `prisma migrate dev` or
# `prisma migrate reset` here — both are destructive and can drop data. The seed
# (`tsx prisma/seed.ts`) is a dev/test convenience and is intentionally NOT run.
set -e

npx prisma migrate deploy

# `exec` replaces this shell with node so node becomes PID 1 and receives SIGTERM
# directly for graceful shutdown. The compiled entrypoint is dist/src/main.js: the
# build also compiles prisma/seed.ts, so nest preserves the src/ subpath under dist/.
exec node dist/src/main
