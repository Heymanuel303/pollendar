import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Recursively replace every `bigint` with its string form. `JSON.stringify(BigInt)` throws and
 * Prisma emits `BigInt` ids, so without this every response would have to call `.toString()` on
 * each id by hand. Dates and other primitives pass through untouched.
 */
function convert(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(convert);
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = convert(val);
  }
  return out;
}

/**
 * Global interceptor that serializes Prisma `BigInt` ids → strings on the wire (DESIGN §3.4),
 * so controllers can return Prisma rows directly without manual `.toString()` per field.
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => convert(data)));
  }
}
