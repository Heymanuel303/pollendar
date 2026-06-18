import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  function makeHost() {
    let body: Record<string, unknown> | undefined;
    const json = jest.fn((b: Record<string, unknown>) => {
      body = b;
    });
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    return { host, status, json, getBody: () => body };
  }

  function makeError(code: string) {
    // meta.target is exactly the internal detail the filter must NOT leak.
    return new Prisma.PrismaClientKnownRequestError('raw db message', {
      code,
      clientVersion: 'x',
      meta: { target: ['email'] },
    });
  }

  it.each([
    ['P2002', HttpStatus.CONFLICT, 'Resource already exists'],
    ['P2025', HttpStatus.NOT_FOUND, 'Resource not found'],
    [
      'P2003',
      HttpStatus.CONFLICT,
      'Operation violates a related-record constraint',
    ],
    ['P9999', HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'],
  ])('maps %s to %d', (code, expectedStatus, expectedMessage) => {
    const { host, status, json } = makeHost();

    filter.catch(makeError(code), host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({
      statusCode: expectedStatus,
      message: expectedMessage,
    });
  });

  it('never leaks the raw code, meta, or message in the response body', () => {
    const { host, getBody } = makeHost();

    filter.catch(makeError('P2002'), host);

    const body = getBody() ?? {};
    expect(Object.keys(body).sort()).toEqual(['message', 'statusCode']);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('raw db message');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('P2002');
  });
});
