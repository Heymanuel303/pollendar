jest.mock('@prisma/adapter-mariadb');
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { buildMariaDbAdapter } from './mariadb-adapter';

describe('buildMariaDbAdapter', () => {
  const ctor = PrismaMariaDb as unknown as jest.Mock;

  beforeEach(() => {
    ctor.mockClear();
  });

  it('parses a mysql:// URL into an explicit mariadb pool config', () => {
    buildMariaDbAdapter('mysql://pollendar:pollendar@localhost:3306/pollendar');

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 3306,
        user: 'pollendar',
        password: 'pollendar',
        database: 'pollendar',
      }),
    );
  });

  it('enables allowPublicKeyRetrieval (MySQL 8.4 caching_sha2_password over plaintext)', () => {
    buildMariaDbAdapter('mysql://u:p@db:3306/app');

    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ allowPublicKeyRetrieval: true }),
    );
  });

  it('defaults the port to 3306 when the URL omits it', () => {
    buildMariaDbAdapter('mysql://u:p@db/app');

    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ port: 3306 }));
  });

  it('url-decodes credentials containing reserved characters', () => {
    buildMariaDbAdapter('mysql://user:p%40ss%3Aword@db:3306/app');

    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'user', password: 'p@ss:word' }),
    );
  });
});
