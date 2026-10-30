import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateFocusLossRule,
  evaluateAppBackgroundedRule,
  evaluateMultiWindowRule,
  evaluatePinExitedRule,
  calculatePinRestoredSeconds,
  evaluateDndFilter,
  createNativeLockdownTracker,
  releaseNativeLockdown,
  FOCUS_BURST_COUNT,
} from './nativeLockdown';
import ExamLock from '../plugins/examLock';
import { isNativeApp } from '../utils/platform';

vi.mock('../utils/platform', () => ({
  isNativeApp: vi.fn(),
}));

describe('src/proctoring/nativeLockdown - Pure Grace Rules & Tracker', () => {
  describe('1. Table-Driven Focus Loss Rule (evaluateFocusLossRule)', () => {
    const focusCases = [
      { lostDurationMs: 0, lossCountIn30s: 0, expected: false, desc: 'no loss' },
      { lostDurationMs: 500, lossCountIn30s: 1, expected: false, desc: 'loss under 2s (500ms)' },
      { lostDurationMs: 1999, lossCountIn30s: 2, expected: false, desc: 'loss under 2s (1999ms)' },
      {
        lostDurationMs: 2000,
        lossCountIn30s: 1,
        expected: true,
        reason: 'focus_lost_duration',
        msgContains: '2s',
        desc: 'loss exactly 2000ms',
      },
      {
        lostDurationMs: 5400,
        lossCountIn30s: 1,
        expected: true,
        reason: 'focus_lost_duration',
        msgContains: '5s',
        desc: 'loss over 5s',
      },
      {
        lostDurationMs: 300,
        lossCountIn30s: 3,
        expected: true,
        reason: 'repeated_focus_loss',
        msgContains: '3+ times',
        desc: '3 focus losses in window',
      },
      {
        lostDurationMs: 100,
        lossCountIn30s: 4,
        expected: true,
        reason: 'repeated_focus_loss',
        msgContains: '3+ times',
        desc: '4 focus losses in window',
      },
    ];

    focusCases.forEach(({ lostDurationMs, lossCountIn30s, expected, reason, msgContains, desc }) => {
      it(`evaluates ${desc}`, () => {
        const res = evaluateFocusLossRule({ lostDurationMs, lossCountIn30s });
        expect(res.shouldViolate).toBe(expected);
        if (expected) {
          expect(res.reason).toBe(reason);
          expect(res.severity).toBe('minor');
          expect(res.message).toContain(msgContains);
        }
      });
    });
  });

  describe('2. Table-Driven App Backgrounded Rule (evaluateAppBackgroundedRule)', () => {
    const bgCases = [
      { awayDurationMs: 0, expected: false, desc: 'instantaneous pause' },
      { awayDurationMs: 1000, expected: false, desc: 'pause 1s' },
      { awayDurationMs: 1999, expected: false, desc: 'pause 1.999s' },
      {
        awayDurationMs: 2000,
        expected: true,
        secondsAway: 2,
        desc: 'pause exactly 2s',
      },
      {
        awayDurationMs: 7800,
        expected: true,
        secondsAway: 8,
        desc: 'pause 7.8s rounded to 8s',
      },
    ];

    bgCases.forEach(({ awayDurationMs, expected, secondsAway, desc }) => {
      it(`evaluates ${desc}`, () => {
        const res = evaluateAppBackgroundedRule({ awayDurationMs });
        expect(res.shouldViolate).toBe(expected);
        if (expected) {
          expect(res.reason).toBe('app_backgrounded');
          expect(res.severity).toBe('major');
          expect(res.secondsAway).toBe(secondsAway);
          expect(res.message).toContain(`${secondsAway}s`);
        }
      });
    });
  });

  describe('3. Multi-Window and Pin-Exited Rules', () => {
    it('evaluates multi-window immediately', () => {
      expect(evaluateMultiWindowRule({ inMultiWindow: false }).shouldViolate).toBe(false);
      const res = evaluateMultiWindowRule({ inMultiWindow: true });
      expect(res.shouldViolate).toBe(true);
      expect(res.severity).toBe('major');
      expect(res.reason).toBe('multi_window');
    });

    it('evaluates pin exited immediately', () => {
      const res = evaluatePinExitedRule();
      expect(res.shouldViolate).toBe(true);
      expect(res.severity).toBe('major');
      expect(res.reason).toBe('pinning_exited');
    });

    it('calculates pin restored seconds', () => {
      expect(calculatePinRestoredSeconds({ exitedAt: 1000, restoredAt: 6000 })).toBe(5);
      expect(calculatePinRestoredSeconds({ exitedAt: null, restoredAt: 6000 })).toBe(0);
      expect(calculatePinRestoredSeconds({ exitedAt: 5000, restoredAt: 4000 })).toBe(0);
    });
  });

  describe('4. Table-Driven DND Filter Evaluation (evaluateDndFilter)', () => {
    const dndCases = [
      { filter: 1, status: 'off', allowed: false, requiresSelfConfirm: false, desc: 'ALL (1)' },
      { filter: 2, status: 'on', allowed: true, requiresSelfConfirm: false, desc: 'PRIORITY (2)' },
      { filter: 3, status: 'on', allowed: true, requiresSelfConfirm: false, desc: 'NONE (3)' },
      { filter: 4, status: 'on', allowed: true, requiresSelfConfirm: false, desc: 'ALARMS (4)' },
      { filter: 0, status: 'unknown', allowed: false, requiresSelfConfirm: true, desc: 'UNKNOWN (0)' },
      { filter: -1, status: 'unknown', allowed: false, requiresSelfConfirm: true, desc: '-1' },
    ];

    dndCases.forEach(({ filter, status, allowed, requiresSelfConfirm, desc }) => {
      it(`correctly evaluates DND filter for ${desc}`, () => {
        const res = evaluateDndFilter(filter);
        expect(res.status).toBe(status);
        expect(res.allowed).toBe(allowed);
        expect(res.requiresSelfConfirm).toBe(requiresSelfConfirm);
      });
    });
  });

  describe('5. Stateful Lockdown Tracker (createNativeLockdownTracker)', () => {
    let violations;
    let telemetryEvents;
    let currentTime;

    beforeEach(() => {
      violations = [];
      telemetryEvents = [];
      currentTime = 100000;
    });

    const setupTracker = () =>
      createNativeLockdownTracker({
        onViolation: (v) => violations.push(v),
        onTelemetry: (name, data) => telemetryEvents.push({ name, data }),
        now: () => currentTime,
      });

    it('suppresses focus loss if focus is restored within 2s', () => {
      const tracker = setupTracker();
      tracker.handleWindowFocus(false, 1000);
      tracker.handleWindowFocus(true, 2500); // 1500 ms loss

      expect(violations).toHaveLength(0);
      expect(telemetryEvents).toContainEqual({
        name: 'window_focus_restored',
        data: { duration_ms: 1500 },
      });
    });

    it('reports FOCUS_LOST if focus is lost >= 2s', () => {
      const tracker = setupTracker();
      tracker.handleWindowFocus(false, 1000);
      tracker.handleWindowFocus(true, 3500); // 2500 ms loss

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('FOCUS_LOST');
      expect(violations[0].durationMs).toBe(2500);
      expect(violations[0].message).toContain('3s');
    });

    it('evaluateFocusLossTimer emits FOCUS_LOST if focus remains lost past 2s', () => {
      const tracker = setupTracker();
      tracker.handleWindowFocus(false, 1000);
      tracker.evaluateFocusLossTimer(2500); // 1.5s - not yet
      expect(violations).toHaveLength(0);

      tracker.evaluateFocusLossTimer(3100); // 2.1s - fires
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('FOCUS_LOST');

      // Restoring focus later does not emit duplicate violation
      tracker.handleWindowFocus(true, 4000);
      expect(violations).toHaveLength(1);
    });

    it('reports FOCUS_LOST when focus is lost 3+ times within 30s', () => {
      const tracker = setupTracker();
      tracker.handleWindowFocus(false, 1000);
      tracker.handleWindowFocus(true, 1500);
      tracker.handleWindowFocus(false, 3000);
      tracker.handleWindowFocus(true, 3500);
      expect(violations).toHaveLength(0);

      // 3rd loss within 30s
      tracker.handleWindowFocus(false, 8000);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('FOCUS_LOST');
      expect(violations[0].reason).toBe('repeated_focus_loss');
    });

    it('does NOT trigger repeated focus loss if losses span > 30s', () => {
      const tracker = setupTracker();
      tracker.handleWindowFocus(false, 1000);
      tracker.handleWindowFocus(true, 1500);
      tracker.handleWindowFocus(false, 20000);
      tracker.handleWindowFocus(true, 20500);

      // 3rd loss is 35s after the 1st loss (older one is pruned)
      tracker.handleWindowFocus(false, 37000);
      expect(violations).toHaveLength(0);
    });

    it('reports APP_BACKGROUNDED when paused >= 2s with seconds in message and payload', () => {
      const tracker = setupTracker();
      tracker.handleActivityPaused(1000);
      tracker.handleActivityResumed(4200); // 3200 ms away

      expect(violations).toHaveLength(1);
      const v = violations[0];
      expect(v.type).toBe('APP_BACKGROUNDED');
      expect(v.severity).toBe('major');
      expect(v.durationMs).toBe(3200);
      expect(v.message).toContain('3s');

      expect(telemetryEvents).toContainEqual({
        name: 'activity_resumed',
        data: { seconds_away: 3 },
      });
    });

    it('does NOT report APP_BACKGROUNDED when paused < 2s', () => {
      const tracker = setupTracker();
      tracker.handleActivityPaused(1000);
      tracker.handleActivityResumed(2500); // 1500 ms away

      expect(violations).toHaveLength(0);
      expect(telemetryEvents).toContainEqual({
        name: 'activity_resumed',
        data: { seconds_away: 2 },
      });
    });

    it('handles PIN_EXITED and computes seconds outside when pinning is restored', () => {
      const tracker = setupTracker();
      tracker.handlePinningExited({ source: 'gesture' }, 10000);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('PIN_EXITED');
      expect(violations[0].severity).toBe('major');

      // Pin restored at 18000 (8s outside)
      tracker.handlePinningStarted({ lockTaskMode: 'pinned', lockTaskModeCode: 2 }, 18000);

      expect(telemetryEvents).toContainEqual({
        name: 'pinning_restored',
        data: { seconds_outside: 8 },
      });
    });

    it('ensures all telemetry payloads contain only numbers, booleans, and short strings', () => {
      const tracker = setupTracker();
      tracker.handleWindowFocus(false, 1000);
      tracker.handleWindowFocus(true, 3500);
      tracker.handleActivityPaused(4000);
      tracker.handleActivityResumed(7500);
      tracker.handleMultiWindowChanged(true, 8000);
      tracker.handlePinningExited({ source: 'button' }, 9000);
      tracker.handlePinningStarted({ lockTaskMode: 'pinned' }, 14000);
      tracker.handlePinningFailed({ reason: 'timeout', timeoutMs: 20000 });

      for (const ev of telemetryEvents) {
        expect(typeof ev.name).toBe('string');
        for (const [, v] of Object.entries(ev.data)) {
          expect(['number', 'string', 'boolean']).toContain(typeof v);
          if (typeof v === 'string') {
            expect(v.length).toBeLessThan(100);
          }
        }
      }
    });
  });

  describe('6. Universal Cleanup Path (releaseNativeLockdown)', () => {
    it('calls stopPinning, disableSecure, and keepAwake(false) when native', async () => {
      const mockPlugin = {
        stopPinning: vi.fn().mockResolvedValue({ success: true }),
        disableSecure: vi.fn().mockResolvedValue({ success: true }),
        keepAwake: vi.fn().mockResolvedValue({ success: true }),
      };

      isNativeApp.mockReturnValue(true);

      await releaseNativeLockdown(mockPlugin);

      expect(mockPlugin.stopPinning).toHaveBeenCalled();
      expect(mockPlugin.disableSecure).toHaveBeenCalled();
      expect(mockPlugin.keepAwake).toHaveBeenCalledWith({ enabled: false });
    });

    it('does nothing when running on web (!isNativeApp)', async () => {
      const mockPlugin = {
        stopPinning: vi.fn().mockResolvedValue({ success: true }),
      };

      isNativeApp.mockReturnValue(false);

      await releaseNativeLockdown(mockPlugin);

      expect(mockPlugin.stopPinning).not.toHaveBeenCalled();
    });
  });
});
