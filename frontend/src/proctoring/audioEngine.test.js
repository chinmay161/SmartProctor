import { describe, expect, it, vi } from 'vitest';
import { createAudioEngine, resampleAudio } from './audioEngine';

describe('audioEngine - resampleAudio', () => {
  it('resamples 48 kHz audio to 16 kHz (3:1 downsampling ratio)', () => {
    // 48000 samples at 48 kHz should produce 16000 samples at 16 kHz
    const input = new Float32Array(48000);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = Math.sin((i / 48000) * 2 * Math.PI * 440); // 440 Hz sine wave
    }

    const output = resampleAudio(input, 48000, 16000);
    expect(output.length).toBe(16000);
    // Interpolated values should preserve signal shape
    expect(output[0]).toBeCloseTo(input[0], 5);
  });

  it('returns a copy when source rate equals target rate', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const output = resampleAudio(input, 16000, 16000);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it('handles empty or null inputs gracefully', () => {
    expect(resampleAudio(null, 48000, 16000).length).toBe(0);
    expect(resampleAudio(new Float32Array(0), 48000, 16000).length).toBe(0);
  });
});

describe('audioEngine - 48 kHz chunk feeding with mock classifier', () => {
  it('buffers and downsamples 48 kHz chunks to 16 kHz and calls classify() with 15600 samples at 16000 Hz', () => {
    const mockClassify = vi.fn(() => [
      {
        classifications: [
          {
            categories: [
              { categoryName: 'Speech', score: 0.88 },
              { categoryName: 'Silence', score: 0.05 },
            ],
          },
        ],
      },
    ]);

    const mockClassifier = {
      classify: mockClassify,
      close: vi.fn(),
    };

    const samplesEmitted = [];
    const engine = createAudioEngine({
      classifier: mockClassifier,
      sourceSampleRate: 48000,
      onSample: (s) => samplesEmitted.push(s),
    });

    // 4096 samples at 48 kHz -> downsampled to 4096 / 3 = 1365 samples per chunk.
    // 12 chunks * 1365 = 16380 samples, which crosses TARGET_CHUNK_SIZE (15600).
    const chunk48k = new Float32Array(4096).fill(0.15);

    for (let i = 0; i < 11; i += 1) {
      engine.processChunkForTest(chunk48k, 48000);
    }
    // 11 * 1365 = 15015 samples (not yet 15600)
    expect(mockClassify).not.toHaveBeenCalled();

    // 12th chunk pushes samplesBuffer to 15015 + 1365 = 16380 >= 15600
    engine.processChunkForTest(chunk48k, 48000);

    expect(mockClassify).toHaveBeenCalledTimes(1);
    const [classifiedChunk, sampleRate] = mockClassify.mock.calls[0];
    expect(classifiedChunk.length).toBe(15600);
    expect(sampleRate).toBe(16000);

    // Verify speechScore emitted
    expect(samplesEmitted.length).toBe(1);
    expect(samplesEmitted[0].speechScore).toBe(0.88);
  });
});
