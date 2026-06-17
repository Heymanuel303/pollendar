# backend (NestJS + Prisma)

Generated in **Phase 0** — see [`../docs/PLAN.md`](../docs/PLAN.md).

This folder is intentionally empty until scaffolding. Phase 0 runs:

```bash
npx @nestjs/cli@latest new backend --package-manager npm --strict
cd backend
npm install @nestjs/config @nestjs/jwt @nestjs/throttler prisma @prisma/client \
  class-validator class-transformer cookie-parser nodemailer
npx prisma init --datasource-provider mysql
```

Module layout and the Prisma schema are defined in
[`../docs/DESIGN.md`](../docs/DESIGN.md).
