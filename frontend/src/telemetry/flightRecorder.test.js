// Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlightRecorder, BUFFER_CAP, STORAGE_KEY, sanitizeData } from './flightRecorder';
import { VIOLATION_DROP_REASONS } from './violationDropReasons';

class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
}

describe('FlightRecorder Telemetry Client', () => {
  let recorder;
  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockSessionStorage();
    globalThis.sessionStorage = mockStorage;
    globalThis.window = {
      sessionStorage: mockStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.restoreAllMocks();
    recorder = new FlightRecorder();
  });

  afterEach(() => {
    if (recorder) {
      recorder.destroy();
    }
    if (globalThis.sessionStorage) {
      globalThis.sessionStorage.clear();
    }
  });

  describe('Buffer Cap and Overflow', () => {
    it('caps buffer at 500 events and maintains dropped count', () => {
      expect(BUFFER_CAP).toBe(500);

      // Record 550 events
      for (let i = 1; i <= 550; i += 1) {
        recorder.record('lifecycle', 'test_event', { index: i });
      }

      expect(recorder.buffer.length).toBe(500);
      expect(recorder.droppedCount).toBe(50);
      expect(recorder.seq).toBe(550);

      // The oldest 50 should have been dropped: first in buffer should have index 51
      expect(recorder.buffer[0].data.index).toBe(51);
      // The last in buffer should have index 550
      expect(recorder.buffer[499].data.index).toBe(550);
    });

    it('never throws even with null, undefined, or unexpected data types', () => {
      expect(() => {
        recorder.record('error', 'bad_data', undefined);
        recorder.record('error', 'bad_data', null);
        recorder.record('error', 'bad_data', 'simple string');
        recorder.record('error', 'bad_data', 12345);
      }).not.toThrow();

      expect(recorder.buffer.length).toBe(4);
    });
  });

  describe('Sanitization (NO audio, images, tokens, emails, answers)', () => {
    it('drops sensitive and forbidden keys and truncates long strings', () => {
      const sensitiveInput = {
        session_id: 'sess-123',
        auth_token: 'secret-bearer-token',
        authorization: 'Bearer token',
        user_email: 'student@example.com',
        webcam_image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        audio_clip: [1, 2, 3],
        answer_text: 'The answer is 42',
        description: 'a'.repeat(600),
        status: 'active',
        fps: 29.5,
      };

      const sanitized = sanitizeData(sensitiveInput);

      // Forbidden keys must be completely absent
      expect(sanitized.auth_token).toBeUndefined();
      expect(sanitized.authorization).toBeUndefined();
      expect(sanitized.user_email).toBeUndefined();
      expect(sanitized.webcam_image).toBeUndefined();
      expect(sanitized.audio_clip).toBeUndefined();
      expect(sanitized.answer_text).toBeUndefined();

      // Allowed keys remain
      expect(sanitized.session_id).toBe('sess-123');
      expect(sanitized.status).toBe('active');
      expect(sanitized.fps).toBe(29.5);

      // Strings longer than 512 characters must be truncated
      expect(sanitized.description.length).toBe(512);
    });
  });

  describe('Flush and Retry with Backoff', () => {
    it('retries with exponential backoff on fetch error and clears buffer on success', async () => {
      recorder.init({ traceId: 'test-trace-123' });
      recorder.record('socket', 'connected', { status: 'open' });
      recorder.record('socket', 'message', { type: 'ping' });

      expect(recorder.buffer.length).toBe(2);

      // 1. Simulate network failure (500 Server Error)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      expect(recorder.backoffMs).toBe(1000);
      await recorder.flush();

      // Failed flush: items must remain in buffer and backoff should increase
      expect(recorder.buffer.length).toBe(2);
      expect(recorder.backoffMs).toBe(2000);

      // 2. Simulate second failure (429 Rate Limit)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Too Many Requests',
      });

      await recorder.flush();
      expect(recorder.buffer.length).toBe(2);
      expect(recorder.backoffMs).toBe(4000);

      // 3. Simulate successful flush (200 OK)
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accepted: 2, skipped: 0 }),
      });

      await recorder.flush();

      // Succeeded: buffer cleared, backoff reset
      expect(recorder.buffer.length).toBe(0);
      expect(recorder.backoffMs).toBe(1000);
    });
  });

  describe('Reload Persistence via sessionStorage', () => {
    it('persists unsent buffer to sessionStorage and restores across reload within the same trace', () => {
      const traceId = 'trace-survive-reload-999';
      recorder.init({ traceId, sessionId: 'sess-888', examId: 'exam-777' });

      recorder.record('gate', 'camera_check_passed', { fps: 30 });
      recorder.record('lifecycle', 'exam_start', { attempt: 1 });

      expect(recorder.buffer.length).toBe(2);

      // Check sessionStorage has stored state
      const savedRaw = mockStorage.getItem(STORAGE_KEY);
      expect(savedRaw).toBeTruthy();
      const savedState = JSON.parse(savedRaw);
      expect(savedState.traceId).toBe(traceId);
      expect(savedState.sessionId).toBe('sess-888');
      expect(savedState.buffer.length).toBe(2);
      expect(savedState.seq).toBe(2);

      // Simulate page reload: instantiate new FlightRecorder instance
      const reloadedRecorder = new FlightRecorder();
      reloadedRecorder.init();

      expect(reloadedRecorder.getTraceId()).toBe(traceId);
      expect(reloadedRecorder.sessionId).toBe('sess-888');
      expect(reloadedRecorder.seq).toBe(2);
      expect(reloadedRecorder.buffer.length).toBe(2);
      expect(reloadedRecorder.buffer[0].name).toBe('camera_check_passed');
      expect(reloadedRecorder.buffer[1].name).toBe('exam_start');

      reloadedRecorder.destroy();
    });
  });

  describe('Every Drop Reason is Recorded', () => {
    it('successfully records violation_dropped for all known drop reasons', () => {
      const allReasons = Object.values(VIOLATION_DROP_REASONS);
      expect(allReasons.length).toBeGreaterThanOrEqual(12);

      for (const reason of allReasons) {
        recorder.record('violation', 'violation_dropped', {
          reason,
          type: 'LOOKING_AWAY',
          rule: 'looking_away_ratio',
        });
      }

      expect(recorder.buffer.length).toBe(allReasons.length);

      // Verify each event in the buffer
      allReasons.forEach((expectedReason, index) => {
        const evt = recorder.buffer[index];
        expect(evt.category).toBe('violation');
        expect(evt.name).toBe('violation_dropped');
        expect(evt.data.reason).toBe(expectedReason);
        expect(evt.data.type).toBe('LOOKING_AWAY');
      });
    });

    it('contains all required drop path reason constants', () => {
      expect(VIOLATION_DROP_REASONS.RULE_DISABLED).toBe('rule_disabled');
      expect(VIOLATION_DROP_REASONS.GRACE).toBe('grace');
      expect(VIOLATION_DROP_REASONS.UNLOADING).toBe('unloading');
      expect(VIOLATION_DROP_REASONS.EPISODE_OPEN).toBe('episode_open');
      expect(VIOLATION_DROP_REASONS.COOLDOWN).toBe('cooldown');
      expect(VIOLATION_DROP_REASONS.CAMERA_LOST).toBe('camera_lost');
      expect(VIOLATION_DROP_REASONS.MIC_SUSPENDED).toBe('mic_suspended');
      expect(VIOLATION_DROP_REASONS.SHADOW_MODE).toBe('shadow_mode');
      expect(VIOLATION_DROP_REASONS.NOT_MONITORING).toBe('not_monitoring');
      expect(VIOLATION_DROP_REASONS.UNMAPPED_TYPE).toBe('unmapped_type');
      expect(VIOLATION_DROP_REASONS.DOCUMENT_HIDDEN).toBe('document_hidden');
      expect(VIOLATION_DROP_REASONS.CONFIDENCE_THRESHOLD).toBe('confidence_threshold');
    });
  });
});
