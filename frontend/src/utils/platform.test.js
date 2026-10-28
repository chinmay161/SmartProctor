import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNativeApp, getNativeCallbackUrl, openUrl, getAppVersion } from './platform';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn(),
  },
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(),
    close: vi.fn(),
  },
}));

describe('platform utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isNativeApp', () => {
    it('returns true when Capacitor.isNativePlatform() is true', () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      expect(isNativeApp()).toBe(true);
    });

    it('returns false when Capacitor.isNativePlatform() is false', () => {
      Capacitor.isNativePlatform.mockReturnValue(false);
      expect(isNativeApp()).toBe(false);
    });
  });

  describe('getNativeCallbackUrl', () => {
    it('constructs the custom scheme callback url matching Auth0 Ionic React pattern', () => {
      const url = getNativeCallbackUrl('test-tenant.us.auth0.com');
      expect(url).toBe(
        'io.smartproctor.exam://test-tenant.us.auth0.com/capacitor/io.smartproctor.exam/callback'
      );
    });
  });

  describe('openUrl', () => {
    it('uses Browser.open when running natively', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      Browser.open.mockResolvedValue();

      await openUrl('https://example.com/auth');

      expect(Browser.open).toHaveBeenCalledWith({ url: 'https://example.com/auth' });
    });

    it('uses window.location.assign when running on web', async () => {
      Capacitor.isNativePlatform.mockReturnValue(false);
      const mockAssign = vi.fn();
      const prevWindow = globalThis.window;
      globalThis.window = {
        location: {
          assign: mockAssign,
        },
      };

      try {
        await openUrl('https://example.com/auth');
        expect(Browser.open).not.toHaveBeenCalled();
        expect(mockAssign).toHaveBeenCalledWith('https://example.com/auth');
      } finally {
        globalThis.window = prevWindow;
      }
    });
  });

  describe('getAppVersion', () => {
    it('returns native version from App.getInfo() when isNativeApp() is true', async () => {
      Capacitor.isNativePlatform.mockReturnValue(true);
      App.getInfo.mockResolvedValue({ version: '1.2.3' });

      const version = await getAppVersion();
      expect(version).toBe('v1.2.3');
    });

    it('returns formatted web package version when isNativeApp() is false', async () => {
      Capacitor.isNativePlatform.mockReturnValue(false);

      const version = await getAppVersion();
      expect(version.startsWith('v')).toBe(true);
    });
  });
});
