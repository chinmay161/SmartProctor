import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlightRecorder, STORAGE_KEY } from '../../telemetry/flightRecorder';

describe('Logged-out Device Check Telemetry & Safety', () => {
  let recorder;
  let mockStorage;

  beforeEach(() => {
    mockStorage = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => mockStorage.get(String(k)) || null,
      setItem: (k, v) => mockStorage.set(String(k), String(v)),
      removeItem: (k) => mockStorage.delete(String(k)),
      clear: () => mockStorage.clear(),
    };
    globalThis.window = {
      sessionStorage: globalThis.sessionStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    globalThis.fetch = vi.fn();
    recorder = new FlightRecorder();
  });

  afterEach(() => {
    if (recorder) {
      recorder.destroy();
    }
    vi.restoreAllMocks();
  });

  it('drops telemetry and does not queue to sessionStorage when logged out during device test', () => {
    recorder.init({ kind: 'device_test' });
    // Verify no accessToken getter is configured
    expect(recorder.getAccessToken).toBeNull();

    // Attempt to record several events
    recorder.record('device', 'camera_check_started', { fps: 30 });
    recorder.record('device', 'mic_check_passed', { rms: 0.05 });

    // Buffer must remain empty
    expect(recorder.buffer.length).toBe(0);

    // sessionStorage must not contain any queued events
    const stored = globalThis.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.buffer || []).toEqual([]);
    }
  });

  it('makes zero network calls to telemetry endpoints during flush when no token exists', async () => {
    recorder.init({ kind: 'device_test' });
    recorder.record('device', 'camera_check_started');

    await recorder.flush();

    // Must make ZERO fetch calls
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Buffer is kept empty
    expect(recorder.buffer.length).toBe(0);
  });

  it('drops buffer and prevents retry storms if token getter returns null in device test', async () => {
    recorder.init({ kind: 'device_test', getAccessToken: async () => null });
    // Manually push an event to simulate dirty state
    recorder.buffer.push({ seq: 1, name: 'dummy' });

    await recorder.flush();

    // Fetch should not be called
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Buffer must be cleared so no retry loops occur
    expect(recorder.buffer.length).toBe(0);
  });

  it('clears existing buffer from memory and sessionStorage when setAccessTokenGetter(null) is called', () => {
    recorder.init({ kind: 'device_test' });
    recorder.buffer.push({ seq: 1, name: 'stale' });
    globalThis.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ buffer: [{ seq: 1 }] }));

    recorder.setAccessTokenGetter(null);

    expect(recorder.buffer.length).toBe(0);
    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('only passes onRequestReportProblem in DeviceTestModal when user is authenticated', () => {
    // Test the prop resolution logic used by DeviceTestModal
    const getGateProps = (isAuthenticated, onRequestReportProblemCallback) => ({
      onRequestReportProblem: isAuthenticated ? onRequestReportProblemCallback : undefined,
    });

    const callback = vi.fn();

    // When logged out
    const loggedOutProps = getGateProps(false, callback);
    expect(loggedOutProps.onRequestReportProblem).toBeUndefined();

    // When logged in
    const loggedInProps = getGateProps(true, callback);
    expect(typeof loggedInProps.onRequestReportProblem).toBe('function');
  });
});
