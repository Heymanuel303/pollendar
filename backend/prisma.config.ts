import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Pollendar keeps a single source of truth for env in the repo-root `.env`
// (no secrets duplicated under backend/). Load it for the Prisma CLI, resolved
// relative to this config file so it works regardless of the current directory.
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
config({ path: rootEnv });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Prisma 7 reads the seed command here (not package.json's `prisma.seed`).
    // Consumed by `prisma db seed` and `prisma migrate reset`.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
