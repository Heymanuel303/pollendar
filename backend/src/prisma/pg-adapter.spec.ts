jest.mock('@prisma/adapter-pg');
import { PrismaPg } from '@prisma/adapter-pg';
import { buildPgAdapter } from './pg-adapter';

describe('buildPgAdapter', () => {
  const ctor = PrismaPg as unknown as jest.Mock;

  beforeEach(() => {
    ctor.mockClear();
  });

  it('passes the postgresql:// URL to the adapter as connectionString', () => {
    buildPgAdapter('postgresql://pollendar:pollendar@localhost:5432/pollendar');

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith({
      connectionString:
        'postgresql://pollendar:pollendar@localhost:5432/pollendar',
    });
  });
});
