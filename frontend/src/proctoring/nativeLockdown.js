import ExamLock from '../plugins/examLock';
import { isNativeApp } from '../utils/platform';

/**
 * Pure rules for native lockdown proctoring:
 * - FOCUS_LOST: only if focus is lost >= 2 s, or 3+ times within 30 s
 * - APP_BACKGROUNDED: when the app was paused >= 2 s (seconds away in message)
 * - MULTI_WINDOW: immediately
 * - PIN_EXITED: immediately (seconds outside pin recorded upon restoration)
 * Payloads: numbers and short strings only.
 */

export const FOCUS_LOST_THRESHOLD_MS = 2000;
export const FOCUS_BURST_WINDOW_MS = 30000;
export const FOCUS_BURST_COUNT = 3;
export const APP_PAUSED_THRESHOLD_MS = 2000;

/**
 * Pure evaluator for focus loss rule.
 */
export function evaluateFocusLossRule({ lostDurationMs = 0, lossCountIn30s = 0 } = {}) {
  if (lossCountIn30s >= FOCUS_BURST_COUNT) {
    return {
      shouldViolate: true,
      reason: 'repeated_focus_loss',
      severity: 'minor',
      message: 'Window lost focus repeatedly (3+ times in 30s)',
      durationMs: 0,
    };
  }
  if (lostDurationMs >= FOCUS_LOST_THRESHOLD_MS) {
    const sec = Math.round(lostDurationMs / 1000);
    return {
      shouldViolate: true,
      reason: 'focus_lost_duration',
      severity: 'minor',
      message: `Window lost focus for ${sec}s`,
      durationMs: Math.round(lostDurationMs),
    };
  }
  return { shouldViolate: false };
}

/**
 * Pure evaluator for app backgrounded rule.
 */
export function evaluateAppBackgroundedRule({ awayDurationMs = 0 } = {}) {
  if (awayDurationMs >= APP_PAUSED_THRESHOLD_MS) {
    const sec = Math.round(awayDurationMs / 1000);
    return {
      shouldViolate: true,
      reason: 'app_backgrounded',
      severity: 'major',
      message: `App was in background for ${sec}s`,
      durationMs: Math.round(awayDurationMs),
      secondsAway: sec,
    };
  }
  return { shouldViolate: false };
}

/**
 * Pure evaluator for multi-window rule.
 */
export function evaluateMultiWindowRule({ inMultiWindow = false } = {}) {
  if (inMultiWindow) {
    return {
      shouldViolate: true,
      reason: 'multi_window',
      severity: 'major',
      message: 'Split screen / multi-window mode detected',
      durationMs: 0,
    };
  }
  return { shouldViolate: false };
}

/**
 * Pure evaluator for pin exited rule.
 */
export function evaluatePinExitedRule() {
  return {
    shouldViolate: true,
    reason: 'pinning_exited',
    severity: 'major',
    message: 'Screen pinning was exited',
    durationMs: 0,
  };
}

/**
 * Pure helper for seconds outside pin calculation.
 */
export function calculatePinRestoredSeconds({ exitedAt, restoredAt }) {
  if (exitedAt == null || restoredAt == null) return 0;
  return Math.max(0, Math.round((restoredAt - exitedAt) / 1000));
}

/**
 * Pure evaluator for DND filter status.
 * - ALL (1) -> blocked ('off')
 * - PRIORITY (2), NONE (3), ALARMS (4) -> allowed ('on')
 * - UNKNOWN (0), -1 -> needs self-confirmation ('unknown')
 */
export function evaluateDndFilter(filter) {
  if (filter === 1) {
    return { status: 'off', allowed: false, requiresSelfConfirm: false };
  }
  if (filter === 2 || filter === 3 || filter === 4) {
    return { status: 'on', allowed: true, requiresSelfConfirm: false };
  }
  return { status: 'unknown', allowed: false, requiresSelfConfirm: true };
}

/**
 * Factory for stateful lockdown session tracker.
 * Dispatches pure violation and telemetry events without direct UI/DOM binding.
 */
export function createNativeLockdownTracker({
  onViolation,
  onTelemetry,
  now = () => Date.now(),
} = {}) {
  let focusLostAt = null;
  let focusLossHistory = [];
  let focusViolationEmittedForLoss = false;
  let pausedAt = null;
  let pinnedExitedAt = null;

  return {
    handleWindowFocus(hasFocus, timestamp) {
      const t = timestamp ?? now();
      if (!hasFocus) {
        focusLostAt = t;
        focusViolationEmittedForLoss = false;
        focusLossHistory = [...focusLossHistory.filter((ts) => t - ts <= FOCUS_BURST_WINDOW_MS), t];

        onTelemetry?.('window_focus_lost', {
          timestamp: t,
          count_30s: focusLossHistory.length,
        });

        if (focusLossHistory.length >= FOCUS_BURST_COUNT) {
          focusViolationEmittedForLoss = true;
          const evaluation = evaluateFocusLossRule({ lossCountIn30s: focusLossHistory.length });
          onViolation?.({
            type: 'FOCUS_LOST',
            severity: evaluation.severity,
            message: evaluation.message,
            confidence: 1.0,
            durationMs: evaluation.durationMs,
            reason: evaluation.reason,
          });
        }
      } else {
        if (focusLostAt !== null) {
          const lostDuration = Math.max(0, t - focusLostAt);
          onTelemetry?.('window_focus_restored', {
            duration_ms: Math.round(lostDuration),
          });

          if (lostDuration >= FOCUS_LOST_THRESHOLD_MS && !focusViolationEmittedForLoss) {
            const evaluation = evaluateFocusLossRule({ lostDurationMs: lostDuration });
            onViolation?.({
              type: 'FOCUS_LOST',
              severity: evaluation.severity,
              message: evaluation.message,
              confidence: 1.0,
              durationMs: evaluation.durationMs,
              reason: evaluation.reason,
            });
          }
          focusLostAt = null;
          focusViolationEmittedForLoss = false;
        }
      }
    },

    evaluateFocusLossTimer(timestamp) {
      const t = timestamp ?? now();
      if (focusLostAt !== null && !focusViolationEmittedForLoss) {
        const lostDuration = Math.max(0, t - focusLostAt);
        if (lostDuration >= FOCUS_LOST_THRESHOLD_MS) {
          focusViolationEmittedForLoss = true;
          const evaluation = evaluateFocusLossRule({ lostDurationMs: lostDuration });
          onViolation?.({
            type: 'FOCUS_LOST',
            severity: evaluation.severity,
            message: evaluation.message,
            confidence: 1.0,
            durationMs: evaluation.durationMs,
            reason: evaluation.reason,
          });
        }
      }
    },

    handleActivityPaused(timestamp) {
      const t = timestamp ?? now();
      pausedAt = t;
      onTelemetry?.('activity_paused', { timestamp: t });
    },

    handleActivityResumed(timestamp) {
      const t = timestamp ?? now();
      if (pausedAt !== null) {
        const awayMs = Math.max(0, t - pausedAt);
        const secondsAway = Math.round(awayMs / 1000);
        onTelemetry?.('activity_resumed', { seconds_away: secondsAway });

        const evaluation = evaluateAppBackgroundedRule({ awayDurationMs: awayMs });
        if (evaluation.shouldViolate) {
          onViolation?.({
            type: 'APP_BACKGROUNDED',
            severity: evaluation.severity,
            message: evaluation.message,
            confidence: 1.0,
            durationMs: evaluation.durationMs,
            reason: evaluation.reason,
          });
        }
        pausedAt = null;
      }
    },

    handleMultiWindowChanged(inMultiWindow, timestamp) {
      const t = timestamp ?? now();
      onTelemetry?.('multi_window_changed', {
        in_multi_window: Boolean(inMultiWindow),
        timestamp: Number(t),
      });

      const evaluation = evaluateMultiWindowRule({ inMultiWindow });
      if (evaluation.shouldViolate) {
        onViolation?.({
          type: 'MULTI_WINDOW',
          severity: evaluation.severity,
          message: evaluation.message,
          confidence: 1.0,
          durationMs: 0,
          reason: evaluation.reason,
        });
      }
    },

    handlePinningExited(data, timestamp) {
      const t = timestamp ?? now();
      pinnedExitedAt = t;
      onTelemetry?.('pinning_exited', {
        source: String(data?.source || 'system'),
        lockTaskMode: 'none',
      });

      const evaluation = evaluatePinExitedRule();
      onViolation?.({
        type: 'PIN_EXITED',
        severity: evaluation.severity,
        message: evaluation.message,
        confidence: 1.0,
        durationMs: 0,
        reason: evaluation.reason,
      });
    },

    handlePinningStarted(data, timestamp) {
      const t = timestamp ?? now();
      onTelemetry?.('pinning_started', {
        mode: String(data?.lockTaskMode || 'pinned'),
        lockTaskModeCode: Number(data?.lockTaskModeCode || 2),
      });

      if (pinnedExitedAt !== null) {
        const secondsOutside = calculatePinRestoredSeconds({
          exitedAt: pinnedExitedAt,
          restoredAt: t,
        });
        onTelemetry?.('pinning_restored', { seconds_outside: secondsOutside });
        pinnedExitedAt = null;
      }
    },

    handlePinningFailed(data) {
      onTelemetry?.('pinning_failed', {
        reason: String(data?.reason || 'timeout'),
        timeout_ms: Number(data?.timeoutMs || 20000),
      });
    },

    getState() {
      return {
        focusLostAt,
        focusLossHistoryCount: focusLossHistory.length,
        focusViolationEmittedForLoss,
        pausedAt,
        pinnedExitedAt,
      };
    },

    reset() {
      focusLostAt = null;
      focusLossHistory = [];
      focusViolationEmittedForLoss = false;
      pausedAt = null;
      pinnedExitedAt = null;
    },
  };
}

/**
 * Universal cleanup in EVERY exit path (submit, forced submit, time-up, error boundary, unmount, logout):
 * stopPinning, disableSecure, keepAwake(false).
 */
export async function releaseNativeLockdown(plugin = ExamLock) {
  if (!isNativeApp()) return;
  try {
    await plugin.stopPinning();
  } catch (err) {
    console.warn('[nativeLockdown] stopPinning failed:', err);
  }
  try {
    await plugin.disableSecure();
  } catch (err) {
    console.warn('[nativeLockdown] disableSecure failed:', err);
  }
  try {
    await plugin.keepAwake({ enabled: false });
  } catch (err) {
    console.warn('[nativeLockdown] keepAwake(false) failed:', err);
  }
}
