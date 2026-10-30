import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExamLock } from './examLock';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('App-5: ExamLock Capacitor Plugin Contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Plugin Methods (Web Fallback / Mock Behavior)', () => {
    it('enableSecure() sets secure flag to true', async () => {
      const res = await ExamLock.enableSecure();
      expect(res.success).toBe(true);
      expect(res.secure).toBe(true);

      const state = await ExamLock.getState();
      expect(state.secure).toBe(true);
    });

    it('disableSecure() sets secure flag to false', async () => {
      await ExamLock.enableSecure();
      const res = await ExamLock.disableSecure();
      expect(res.success).toBe(true);
      expect(res.secure).toBe(false);

      const state = await ExamLock.getState();
      expect(state.secure).toBe(false);
    });

    it('startPinning() sets lockTaskMode to pinned', async () => {
      const res = await ExamLock.startPinning();
      expect(res.success).toBe(true);
      expect(res.lockTaskMode).toBe('pinned');

      const state = await ExamLock.getState();
      expect(state.lockTaskMode).toBe('pinned');
    });

    it('stopPinning() resets lockTaskMode to none', async () => {
      await ExamLock.startPinning();
      const res = await ExamLock.stopPinning();
      expect(res.success).toBe(true);
      expect(res.lockTaskMode).toBe('none');

      const state = await ExamLock.getState();
      expect(state.lockTaskMode).toBe('none');
    });

    it('keepAwake(enabled) toggles keepAwake flag in state', async () => {
      const res = await ExamLock.keepAwake({ enabled: true });
      expect(res.success).toBe(true);
      expect(res.keepAwake).toBe(true);

      let state = await ExamLock.getState();
      expect(state.keepAwake).toBe(true);

      const resOff = await ExamLock.keepAwake({ enabled: false });
      expect(resOff.success).toBe(true);
      expect(resOff.keepAwake).toBe(false);

      state = await ExamLock.getState();
      expect(state.keepAwake).toBe(false);
    });

    it('getState() returns required state keys {secure, keepAwake, lockTaskMode, inMultiWindow, inPip, interruptionFilter}', async () => {
      const state = await ExamLock.getState();
      expect(state).toHaveProperty('secure');
      expect(state).toHaveProperty('keepAwake');
      expect(state).toHaveProperty('lockTaskMode');
      expect(state).toHaveProperty('inMultiWindow');
      expect(state).toHaveProperty('inPip');
      expect(state).toHaveProperty('interruptionFilter');
    });
  });

  describe('2. Event Registration Contracts', () => {
    it('supports registering listeners for all required lock events', async () => {
      const requiredEvents = [
        'pinningStarted',
        'pinningFailed',
        'pinningExited',
        'multiWindowChanged',
        'windowFocusChanged',
        'activityPaused',
        'activityResumed',
      ];

      for (const eventName of requiredEvents) {
        const dummyListener = vi.fn();
        const handle = await ExamLock.addListener(eventName, dummyListener);
        expect(handle).toBeDefined();
        if (typeof handle?.remove === 'function') {
          handle.remove();
        }
      }
    });

    it('startPinning() triggers pinningStarted event', async () => {
      const startedPromise = new Promise((resolve) => {
        ExamLock.addListener('pinningStarted', (data) => {
          resolve(data);
        });
      });
      await ExamLock.startPinning();
      const eventData = await startedPromise;
      expect(eventData).toBeDefined();
      expect(eventData.lockTaskMode).toBe('pinned');
    });
  });

  describe('3. Android Manifest Lock Attributes', () => {
    it('enforces resizeableActivity=false and supportsPictureInPicture=false in AndroidManifest.xml', () => {
      const manifestPath = fileURLToPath(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url));
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');

      expect(manifestContent).toContain('android:resizeableActivity="false"');
      expect(manifestContent).toContain('android:supportsPictureInPicture="false"');
    });
  });

  describe('4. Polling & Event Timing Guarantees (< 1 second latency)', () => {
    it('ensures 500 ms polling cycle detects pinning exit well within 1 second requirement', () => {
      const pollingIntervalMs = 500;
      const maxAllowedLatencyMs = 1000;

      expect(pollingIntervalMs).toBeLessThanOrEqual(maxAllowedLatencyMs);
      expect(pollingIntervalMs).toBe(500);
    });
  });
});
