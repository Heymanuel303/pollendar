import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { buildPgAdapter } from './pg-adapter';

/**
 * Thin wrapper over the generated Prisma client that ties its connection lifecycle
 * to the Nest module lifecycle. Prisma 7 requires a driver adapter (the Rust engine /
 * built-in URL connection is gone), so we build the PostgreSQL adapter from the
 * validated DATABASE_URL, the single connection string from the repo-root .env.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: buildPgAdapter(config.getOrThrow<string>('DATABASE_URL')),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
