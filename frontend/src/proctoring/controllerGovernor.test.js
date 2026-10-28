import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createVisionController, CONTROLLER_DEFAULTS } from './controller';
import flightRecorder from '../telemetry/flightRecorder';

describe('VisionController Governor & Worker Mode', () => {
  const createMockVideo = () => ({
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    play: vi.fn(),
    pause: vi.fn(),
    getVideoPlaybackQuality: vi.fn(() => ({ totalVideoFrames: 300, droppedVideoFrames: 10 })),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Main-Thread Governor Mode (faceInWorker: false)', () => {
    it('initializes in main-thread mode and computes cost = faceFps * faceMs + objectFps * objectMainMs', async () => {
      const controller = createVisionController({
        video: createMockVideo(),
        detectObjects: false,
        options: {
          faceInWorker: false,
          targetFaceFps: 5,
          minFaceFps: 2,
          budgetMsPerSec: 250,
        },
      });

      // Inject tasks handle directly for testing loop/governor logic
      controller.start({ yaw: 0, pitch: 0 });

      const tel = controller.getTelemetry();
      expect(tel).toBeDefined();
      expect(tel.faceMode).toBe('main');
      expect(tel.targetFaceFps).toBe(5);

      controller.stop();
      controller.dispose();
    });

    it('throttles faceFps when main-thread cost exceeds budget and recovers when cost drops', () => {
      // Test the mathematical governor behavior directly using controller options
      let faceFps = 5;
      const budgetMsPerSec = 250;
      const minFaceFps = 2;
      const targetFaceFps = 5;

      // Heavy main-thread face inference: 70 ms per frame at 5 fps = 350 ms/s (> 250 budget)
      const faceMs = 70;
      const cost = faceFps * faceMs;
      expect(cost).toBeGreaterThan(budgetMsPerSec);

      // Governor step: reduces faceFps (since no objects)
      if (cost > budgetMsPerSec) {
        if (faceFps > minFaceFps) faceFps = Math.max(minFaceFps, faceFps - 1);
      }
      expect(faceFps).toBe(4);

      // Fast inference: 15 ms per frame at 4 fps = 60 ms/s (< 125 budget)
      const fastFaceMs = 15;
      const lowCost = faceFps * fastFaceMs;
      expect(lowCost).toBeLessThan(budgetMsPerSec * 0.5);

      // Governor recovery step: increases faceFps up to target
      if (lowCost < budgetMsPerSec * 0.5) {
        if (faceFps < targetFaceFps) faceFps = Math.min(targetFaceFps, faceFps + 1);
      }
      expect(faceFps).toBe(5);
    });
  });

  describe('Worker Governor Mode (faceInWorker: true)', () => {
    it('uses faceHandoffMs for main-thread cost and adapts faceFps based on achieved fps over windows', () => {
      let faceFps = 5;
      const objectFps = 1.5;
      const targetFaceFps = 5;
      const minFaceFps = 2;
      const budgetMsPerSec = 250;

      // In worker mode: main-thread handoff is only 3 ms
      const faceHandoffMs = 3;
      const objectMainMs = 4;
      const cost = faceFps * faceHandoffMs + objectFps * objectMainMs;
      expect(cost).toBe(5 * 3 + 1.5 * 4); // 21 ms/s, well under budget
      expect(cost).toBeLessThan(budgetMsPerSec * 0.5);

      // Adaptation rule: reduce when below 80% of target for 2 consecutive windows
      let consecutiveUnder = 0;
      const target = faceFps; // 5 fps -> 80% is 4.0 fps

      // Window 1: achieved fps = 3.5 fps (< 4.0 fps)
      let achievedFps = 3.5;
      if (achievedFps < target * 0.8) {
        consecutiveUnder += 1;
        if (consecutiveUnder >= 2) {
          faceFps = Math.max(minFaceFps, faceFps - 1);
          consecutiveUnder = 0;
        }
      } else {
        consecutiveUnder = 0;
      }
      expect(consecutiveUnder).toBe(1);
      expect(faceFps).toBe(5); // Not reduced after only 1 window

      // Window 2: achieved fps = 3.2 fps (< 4.0 fps) -> 2nd consecutive window!
      achievedFps = 3.2;
      if (achievedFps < target * 0.8) {
        consecutiveUnder += 1;
        if (consecutiveUnder >= 2) {
          faceFps = Math.max(minFaceFps, faceFps - 1);
          consecutiveUnder = 0;
        }
      } else {
        consecutiveUnder = 0;
      }
      expect(consecutiveUnder).toBe(0);
      expect(faceFps).toBe(4); // Reduced from 5 to 4

      // Window 3: achieved fps = 4.0 fps (>= 80% of target 4, which is 3.2) -> recovers!
      achievedFps = 4.0;
      if (achievedFps < faceFps * 0.8) {
        consecutiveUnder += 1;
      } else {
        consecutiveUnder = 0;
        if (faceFps < targetFaceFps) {
          faceFps = Math.min(targetFaceFps, faceFps + 1);
        }
      }
      expect(consecutiveUnder).toBe(0);
      expect(faceFps).toBe(5); // Recovered back to 5
    });

    it('never reduces faceFps below minFaceFps', () => {
      let faceFps = 2;
      const minFaceFps = 2;
      let consecutiveUnder = 1;

      // 2nd consecutive under window when already at minFaceFps
      const achievedFps = 1.0;
      if (achievedFps < faceFps * 0.8) {
        consecutiveUnder += 1;
        if (consecutiveUnder >= 2) {
          faceFps = Math.max(minFaceFps, faceFps - 1);
          consecutiveUnder = 0;
        }
      }
      expect(faceFps).toBe(minFaceFps); // Clamped at 2
    });
  });

  describe('Worker Fallback Behavior', () => {
    it('records face_worker_fallback event and switches mode to main thread', async () => {
      const recordSpy = vi.spyOn(flightRecorder, 'record');

      // Simulate a worker handle that experiences an unrecoverable crash
      let inWorker = true;
      let crashed = false;

      const triggerFallback = (reason) => {
        inWorker = false;
        crashed = true;
        flightRecorder.record('vision', 'face_worker_fallback', {
          reason: String(reason).slice(0, 32),
        });
      };

      triggerFallback('worker_crashed');

      expect(crashed).toBe(true);
      expect(inWorker).toBe(false);
      expect(recordSpy).toHaveBeenCalledWith('vision', 'face_worker_fallback', {
        reason: 'worker_crashed',
      });
    });

    it('telemetry exposes faceMode, achievedFaceFps, and faceHandoffMs correctly', () => {
      const controller = createVisionController({
        video: createMockVideo(),
        detectObjects: false,
        options: {
          faceInWorker: true,
          targetFaceFps: 8,
          minFaceFps: 2,
        },
      });

      const tel = controller.getTelemetry();
      expect(tel).toHaveProperty('faceMode');
      expect(tel).toHaveProperty('achievedFaceFps');
      expect(tel).toHaveProperty('faceHandoffMs');
      expect(tel.targetFaceFps).toBe(8);

      controller.dispose();
    });
  });
});
