import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import {
  extractWebViewVersion,
  getPlatformSessionMetadata,
} from './platformInfo';
import { FlightRecorder } from './flightRecorder';
import { setNativeSentryTags } from '../utils/sentryScrubber';

vi.mock('@sentry/react', () => ({
  setTag: vi.fn(),
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe('platformInfo and native telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractWebViewVersion', () => {
    it('extracts Chrome version from Android WebView user agent', () => {
      const ua = 'Mozilla/5.0 (Linux; U; Android 14; Pixel 7 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36';
      expect(extractWebViewVersion(ua)).toBe('120.0.6099.144');
    });

    it('extracts Version/X.Y when Chrome is absent', () => {
      const ua = 'Mozilla/5.0 (Linux; U; Android 11; en-us) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30';
      expect(extractWebViewVersion(ua)).toBe('4.0');
    });

    it('returns "unknown" for unrecognized or empty user agents', () => {
      expect(extractWebViewVersion('')).toBe('unknown');
      expect(extractWebViewVersion(null)).toBe('unknown');
      expect(extractWebViewVersion('CustomBot/1.0')).toBe('unknown');
    });
  });

  describe('getPlatformSessionMetadata', () => {
    it('returns platform: "web" without app_version or webview_version when not native', () => {
      const meta = getPlatformSessionMetadata({ isNative: false });
      expect(meta).toEqual({ platform: 'web' });
      expect(meta.app_version).toBeUndefined();
      expect(meta.webview_version).toBeUndefined();
    });

    it('returns platform: "android", app_version, and webview_version when native', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.6099.144 Mobile';
      const meta = getPlatformSessionMetadata({
        isNative: true,
        platform: 'android',
        userAgent: ua,
        appVersion: '1.0.0',
      });

      expect(meta.platform).toBe('android');
      expect(meta.app_version).toBe('1.0.0');
      expect(meta.webview_version).toBe('120.0.6099.144');
    });

    it('ensures strings are short strings', () => {
      const longVersion = 'a'.repeat(100);
      const meta = getPlatformSessionMetadata({
        isNative: true,
        platform: 'android',
        userAgent: `Chrome/${'1'.repeat(100)}`,
        appVersion: longVersion,
      });

      expect(meta.app_version.length).toBeLessThanOrEqual(32);
      expect(meta.webview_version.length).toBeLessThanOrEqual(32);
    });
  });

  describe('FlightRecorder session-start telemetry', () => {
    let recorder;

    beforeEach(() => {
      recorder = new FlightRecorder();
      recorder.init({ traceId: 'test-trace', sessionId: 'sess-1' });
    });

    it('enriches exam_start event with platform: "web" when on web', () => {
      recorder.record('lifecycle', 'exam_start', { session_id: 'sess-1' });

      expect(recorder.buffer.length).toBe(1);
      const event = recorder.buffer[0];
      expect(event.name).toBe('exam_start');
      expect(event.data.session_id).toBe('sess-1');
      expect(event.data.platform).toBe('web');
      expect(event.data.app_version).toBeUndefined();
      expect(event.data.webview_version).toBeUndefined();
    });

    it('enriches resume event with native metadata when explicitly provided', () => {
      const nativeMeta = getPlatformSessionMetadata({
        isNative: true,
        platform: 'android',
        userAgent: 'Chrome/121.0.0.0',
        appVersion: '1.2.0',
      });

      recorder.record('lifecycle', 'resume', { session_id: 'sess-1', ...nativeMeta });

      const event = recorder.buffer[0];
      expect(event.name).toBe('resume');
      expect(event.data.platform).toBe('android');
      expect(event.data.app_version).toBe('1.2.0');
      expect(event.data.webview_version).toBe('121.0.0.0');
    });

    it('does not add platform metadata to non-session-start events', () => {
      recorder.record('device', 'camera_status_change', { status: 'active' });

      const event = recorder.buffer[0];
      expect(event.name).toBe('camera_status_change');
      expect(event.data.platform).toBeUndefined();
      expect(event.data.app_version).toBeUndefined();
    });

    it('recordSessionStart helper records session start lifecycle event', () => {
      const recorded = recorder.recordSessionStart({ attempt_id: 'att-1' });
      expect(recorded.platform).toBe('web');
      expect(recorder.buffer[0].name).toBe('exam_start');
      expect(recorder.buffer[0].data.attempt_id).toBe('att-1');
      expect(recorder.buffer[0].data.platform).toBe('web');
    });
  });

  describe('setNativeSentryTags', () => {
    it('does NOT set any Sentry tags when running on web', () => {
      const result = setNativeSentryTags({ platform: 'web' });
      expect(result).toBe(false);
      expect(Sentry.setTag).not.toHaveBeenCalled();
    });

    it('sets Sentry tags platform, app_version, and webview_version only when native', () => {
      const result = setNativeSentryTags({
        platform: 'android',
        app_version: '1.0.0',
        webview_version: '120.0.6099.144',
      });

      expect(result).toBe(true);
      expect(Sentry.setTag).toHaveBeenCalledWith('platform', 'android');
      expect(Sentry.setTag).toHaveBeenCalledWith('app_version', '1.0.0');
      expect(Sentry.setTag).toHaveBeenCalledWith('webview_version', '120.0.6099.144');
    });
  });
});
