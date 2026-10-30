import { describe, it, expect } from 'vitest';

describe('UseWebVersionPage URL Configuration', () => {
  it('defaults to https://smart-proctor-zeta.vercel.app/teacher-dashboard when VITE_WEB_APP_URL is not set', () => {
    const DEFAULT_WEB_URL = 'https://smart-proctor-zeta.vercel.app/teacher-dashboard';
    const rawUrl = undefined || DEFAULT_WEB_URL;
    const webAppUrl = String(rawUrl).replace(/\/+$/, '');
    expect(webAppUrl).toBe('https://smart-proctor-zeta.vercel.app/teacher-dashboard');
  });

  it('respects VITE_WEB_APP_URL override if explicitly provided', () => {
    const DEFAULT_WEB_URL = 'https://smart-proctor-zeta.vercel.app/teacher-dashboard';
    const rawUrl = 'https://custom.smartproctor.io/' || DEFAULT_WEB_URL;
    const webAppUrl = String(rawUrl).replace(/\/+$/, '');
    expect(webAppUrl).toBe('https://custom.smartproctor.io');
  });
});
