import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Safety-net filter for Prisma errors that escape the inline `try/catch` mappings in the services
 * (`polls.service.ts`, `public.service.ts`, `notifications.service.ts`). Those services throw
 * `HttpException` subclasses (`Conflict`/`NotFound`/`BadRequest`) which are NOT caught here because
 * `@Catch` is scoped to `Prisma.PrismaClientKnownRequestError` — so their behavior is preserved.
 *
 * Maps the known Prisma codes to clean HTTP statuses and NEVER echoes `exception.code`/`meta`/
 * `message`, so an unhandled DB error can't leak schema internals (column names, constraint targets).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status: HttpStatus;
    let message: string;
    switch (exception.code) {
      case 'P2002': // unique constraint violation
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
        break;
      case 'P2025': // record not found
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
        break;
      case 'P2003': // foreign-key constraint violation
        status = HttpStatus.CONFLICT;
        message = 'Operation violates a related-record constraint';
        break;
      default:
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Internal server error';
    }

    res.status(status).json({ statusCode: status, message });
  }
}
