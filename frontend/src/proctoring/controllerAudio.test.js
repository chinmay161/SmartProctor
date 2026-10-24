import { describe, expect, it, vi } from 'vitest';
import { createVisionController } from './controller';
import { isVisionViolationEnabled } from '../utils/violationSeverity';

describe('VisionController with Audio Engine Integration', () => {
  const createMockAudioEngine = () => {
    let sampleCallback = null;
    let running = false;
    let samplesCount = 0;
    let lastAudioAt = null;

    return {
      onSample: (cb) => {
        sampleCallback = cb;
      },
      emit: (sample) => {
        samplesCount += 1;
        lastAudioAt = sample.ts;
        sampleCallback?.(sample);
      },
      start: vi.fn(async () => {
        running = true;
      }),
      stop: vi.fn(() => {
        running = false;
      }),
      dispose: vi.fn(() => {
        running = false;
      }),
      resume: vi.fn(async () => {}),
      isRunning: () => running,
      getAudioContextState: () => 'running',
      getTrackReadyState: () => 'live',
      getTelemetry: () => ({
        running,
        speechScore: 0.9,
        rms: 0.05,
        lastAudioAt,
        samplesCount,
        lastTopCategory: 'Speech',
      }),
    };
  };

  const createMockVideo = () => ({
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    play: vi.fn(),
    pause: vi.fn(),
  });

  it('produces 5 s of speechScore 0.9 samples: exactly one VOICE_DETECTED passes when audioMonitoring=true', async () => {
    const mockAudio = createMockAudioEngine();
    const reportedViolations = [];

    const wizardConfig = {
      audioMonitoring: true,
      detectFace: true,
      detectMultipleFaces: true,
    };

    const controller = createVisionController({
      video: createMockVideo(),
      micRequired: true,
      options: { audioEngine: mockAudio },
      onViolation: (violation) => {
        if (isVisionViolationEnabled(violation.type, wizardConfig)) {
          reportedViolations.push(violation);
        } else if (violation.type === 'VOICE_DETECTED') {
          controller.setVoiceDroppedReason('disabled_by_wizard_toggle');
        }
      },
    });

    controller.start({ yaw: 0, pitch: 0 });
    await new Promise((r) => setTimeout(r, 10));

    // Emit 5 seconds of audio samples (1 sample per second) with speechScore 0.9
    for (let t = 1000; t <= 5000; t += 1000) {
      mockAudio.emit({ ts: t, speechScore: 0.9, rms: 0.05 });
    }

    // Exactly one VOICE_DETECTED violation passes through the reporting filter
    expect(reportedViolations).toHaveLength(1);
    expect(reportedViolations[0].type).toBe('VOICE_DETECTED');
    expect(reportedViolations[0].severity).toBe('minor');

    // Telemetry exposes all 8 required fields
    const telemetry = controller.getTelemetry();
    expect(telemetry.audio).toMatchObject({
      running: true,
      speechScore: 0.9,
      rms: 0.05,
      samplesCount: 5,
      lastTopCategory: 'Speech',
      voiceEpisodeOpen: true,
    });
    expect(telemetry.audio.lastAudioAt).toBe(5000);
    expect(telemetry.audio).toHaveProperty('droppedReason');

    controller.dispose();
  });

  it('produces 5 s of speechScore 0.9 samples: dropped when audioMonitoring=false', async () => {
    const mockAudio = createMockAudioEngine();
    const reportedViolations = [];

    const wizardConfig = {
      audioMonitoring: false,
      detectFace: true,
      detectMultipleFaces: true,
    };

    const controller = createVisionController({
      video: createMockVideo(),
      micRequired: true,
      options: { audioEngine: mockAudio },
      onViolation: (violation) => {
        if (isVisionViolationEnabled(violation.type, wizardConfig)) {
          reportedViolations.push(violation);
        } else if (violation.type === 'VOICE_DETECTED') {
          controller.setVoiceDroppedReason('disabled_by_wizard_toggle');
        }
      },
    });

    controller.start({ yaw: 0, pitch: 0 });
    await new Promise((r) => setTimeout(r, 10));

    // Emit 5 seconds of audio samples with speechScore 0.9
    for (let t = 1000; t <= 5000; t += 1000) {
      mockAudio.emit({ ts: t, speechScore: 0.9, rms: 0.05 });
    }

    // Dropped by the reporting filter: 0 reported violations
    expect(reportedViolations).toHaveLength(0);

    // Dropped reason is recorded in telemetry
    const telemetry = controller.getTelemetry();
    expect(telemetry.audio.droppedReason).toBe('disabled_by_wizard_toggle');

    controller.dispose();
  });
});
