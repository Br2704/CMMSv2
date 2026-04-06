import { env } from '../config/env';
import type { RequestLike } from '../modules/qr/qr.shared';
import { publicFrontendBaseUrl } from '../modules/qr/qr.shared';

describe('public frontend URL hardening', () => {
  const originalNodeEnv = env.NODE_ENV;
  const originalFrontendUrl = env.FRONTEND_URL;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    env.FRONTEND_URL = originalFrontendUrl;
  });

  it('uses configured frontend URL in production and ignores spoofed host headers', () => {
    env.NODE_ENV = 'production';
    env.FRONTEND_URL = 'https://cmms.example.com';

    const requestLike = {
      protocol: 'http',
      get: (header: string) => {
        if (header.toLowerCase() === 'host') {
          return 'attacker.example';
        }
        return undefined;
      },
    } as unknown as RequestLike;

    expect(publicFrontendBaseUrl(requestLike)).toBe('https://cmms.example.com');
  });
});
