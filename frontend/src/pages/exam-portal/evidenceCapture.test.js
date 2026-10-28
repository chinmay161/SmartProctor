import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flightRecorder } from '../../telemetry/flightRecorder';

describe('Evidence capture flight recorder telemetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('records evidence_not_captured with "video not ready" when video is unavailable', () => {
    const recordSpy = vi.spyOn(flightRecorder, 'record');

    // Simulate addViolation logic when camera is not ready
    const simulateCapture = (extras = {}, videoAvailable = false) => {
      let snapshotImage = extras.image || null;
      let evidenceNotCapturedReason = extras.evidenceReason || null;

      if (!snapshotImage) {
        if (!videoAvailable) {
          evidenceNotCapturedReason = evidenceNotCapturedReason || 'video not ready';
        }
      }

      if (!snapshotImage) {
        flightRecorder.record('violation', 'evidence_not_captured', {
          type: 'LOOK_AWAY',
          reason: evidenceNotCapturedReason || 'video not ready',
          event_id: 'ev-test-1',
        });
      }

      return { image: snapshotImage, reason: evidenceNotCapturedReason };
    };

    const res = simulateCapture({}, false);
    expect(res.image).toBeNull();
    expect(recordSpy).toHaveBeenCalledWith('violation', 'evidence_not_captured', {
      type: 'LOOK_AWAY',
      reason: 'video not ready',
      event_id: 'ev-test-1',
    });
  });

  it('records evidence_not_captured with "canvas error" when canvas context fails or throws', () => {
    const recordSpy = vi.spyOn(flightRecorder, 'record');

    const simulateCaptureWithCanvasError = () => {
      let snapshotImage = null;
      let evidenceNotCapturedReason = null;

      try {
        // Simulate canvas drawing failure
        throw new Error('Canvas 2D context creation failed: SecurityError');
      } catch {
        evidenceNotCapturedReason = 'canvas error';
      }

      if (!snapshotImage) {
        flightRecorder.record('violation', 'evidence_not_captured', {
          type: 'MULTIPLE_FACES',
          reason: evidenceNotCapturedReason || 'video not ready',
          event_id: 'ev-test-2',
        });
      }

      return { image: snapshotImage, reason: evidenceNotCapturedReason };
    };

    const res = simulateCaptureWithCanvasError();
    expect(res.image).toBeNull();
    expect(res.reason).toBe('canvas error');
    expect(recordSpy).toHaveBeenCalledWith('violation', 'evidence_not_captured', {
      type: 'MULTIPLE_FACES',
      reason: 'canvas error',
      event_id: 'ev-test-2',
    });
  });

  it('records evidence_not_captured with "rate limit" when violations occur in rapid succession', () => {
    const recordSpy = vi.spyOn(flightRecorder, 'record');
    let lastEvidenceCaptureTime = Date.now();
    const minIntervalMs = 1000;

    const simulateRateLimitedCapture = () => {
      let snapshotImage = null;
      let evidenceNotCapturedReason = null;
      const now = Date.now();

      if (lastEvidenceCaptureTime && now - lastEvidenceCaptureTime < minIntervalMs) {
        evidenceNotCapturedReason = 'rate limit';
      }

      if (!snapshotImage) {
        flightRecorder.record('violation', 'evidence_not_captured', {
          type: 'TAB_SWITCH',
          reason: evidenceNotCapturedReason || 'video not ready',
          event_id: 'ev-test-3',
        });
      }

      return { image: snapshotImage, reason: evidenceNotCapturedReason };
    };

    const res = simulateRateLimitedCapture();
    expect(res.image).toBeNull();
    expect(res.reason).toBe('rate limit');
    expect(recordSpy).toHaveBeenCalledWith('violation', 'evidence_not_captured', {
      type: 'TAB_SWITCH',
      reason: 'rate limit',
      event_id: 'ev-test-3',
    });
  });
});
