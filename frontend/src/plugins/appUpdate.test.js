import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppUpdate from './appUpdate';

describe('AppUpdate Web Plugin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides getAppVersion returning fallback version info', async () => {
    const versionInfo = await AppUpdate.getAppVersion();
    expect(versionInfo).toHaveProperty('versionName');
    expect(versionInfo).toHaveProperty('platform');
  });

  it('handles 404 from GitHub when no releases exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 404,
      ok: false,
    });

    const result = await AppUpdate.checkForUpdate({ manual: true });
    expect(result.available).toBe(false);
    expect(result.message).toContain('No releases found');
  });

  it('handles 304 Not Modified when ETag matches', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 304,
      ok: false,
    });

    const result = await AppUpdate.checkForUpdate({ manual: true });
    expect(result.available).toBe(false);
    expect(result.isCached).toBe(true);
  });

  it('handles 403 rate limit gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
    });

    const result = await AppUpdate.checkForUpdate({ manual: true });
    expect(result.available).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.message).toContain('rate limit');
  });

  it('ignores draft and pre-release versions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        tag_name: 'v2.0.0-beta',
        draft: false,
        prerelease: true,
        assets: [{ name: 'app.apk', browser_download_url: 'https://example.com/app.apk' }],
      }),
    });

    const result = await AppUpdate.checkForUpdate({ manual: true });
    expect(result.available).toBe(false);
    expect(result.message).toContain('pre-release');
  });

  it('prioritizes release APK and ignores debug APK', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        tag_name: 'v1.3.0',
        draft: false,
        prerelease: false,
        body: '• Production build',
        assets: [
          {
            name: 'SmartProctor-debug.apk',
            browser_download_url: 'https://example.com/debug.apk',
            size: 20000000,
          },
          {
            name: 'SmartProctor-release.apk',
            browser_download_url: 'https://example.com/release.apk',
            size: 22000000,
          },
        ],
      }),
    });

    const result = await AppUpdate.checkForUpdate({ manual: true });
    expect(result.available).toBe(true);
    expect(result.latestVersion).toBe('1.3.0');
    expect(result.apkUrl).toBe('https://example.com/release.apk');
  });
});
