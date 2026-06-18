import { Environment, validate } from './env.validation';

/** A complete, valid env mirroring the repo-root .env (PLAN.md §4). */
const completeEnv = (): Record<string, string> => ({
  NODE_ENV: 'development',
  API_PORT: '3000',
  APP_URL: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: 'mysql://pollendar:pollendar@localhost:3306/pollendar',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '30d',
  MAGIC_LINK_TTL: '15m',
  COOKIE_DOMAIN: 'localhost',
  COOKIE_SECURE: 'false',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  MAIL_FROM: 'Pollendar <no-reply@pollendar.local>',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '10',
});

describe('validate (env)', () => {
  it('accepts a complete, valid env', () => {
    expect(() => validate(completeEnv())).not.toThrow();
  });

  it('coerces numeric strings to numbers and booleans from "true"/"false"', () => {
    const config = validate(completeEnv());
    expect(config.API_PORT).toBe(3000);
    expect(typeof config.API_PORT).toBe('number');
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.THROTTLE_LIMIT).toBe(10);
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.SMTP_SECURE).toBe(false);
    expect(config.NODE_ENV).toBe(Environment.Development);
  });

  it('coerces COOKIE_SECURE="true" to boolean true', () => {
    const config = validate({ ...completeEnv(), COOKIE_SECURE: 'true' });
    expect(config.COOKIE_SECURE).toBe(true);
  });

  it('applies defaults when optional-with-default vars are absent', () => {
    const env = completeEnv();
    delete env.API_PORT;
    delete env.SMTP_PORT;
    delete env.THROTTLE_TTL;
    delete env.THROTTLE_LIMIT;
    delete env.COOKIE_SECURE;
    const config = validate(env);
    expect(config.API_PORT).toBe(3000);
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.THROTTLE_TTL).toBe(60);
    expect(config.THROTTLE_LIMIT).toBe(10);
    expect(config.COOKIE_SECURE).toBe(false);
  });

  it('rejects a config missing a required var (DATABASE_URL)', () => {
    const env = completeEnv();
    delete env.DATABASE_URL;
    expect(() => validate(env)).toThrow(/DATABASE_URL/);
  });

  it('rejects a config missing a required secret (JWT_ACCESS_SECRET)', () => {
    const env = completeEnv();
    delete env.JWT_ACCESS_SECRET;
    expect(() => validate(env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a non-numeric API_PORT', () => {
    expect(() =>
      validate({ ...completeEnv(), API_PORT: 'not-a-port' }),
    ).toThrow(/API_PORT/);
  });

  it('rejects an out-of-range API_PORT', () => {
    expect(() => validate({ ...completeEnv(), API_PORT: '70000' })).toThrow(
      /API_PORT/,
    );
  });

  it('allows empty SMTP credentials (Mailpit needs no auth)', () => {
    expect(() => validate(completeEnv())).not.toThrow();
  });
});
