import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectingSocket } from './reconnectingSocket';

class MockWebSocket {
  static instances = [];
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sentData = [];
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen({ type: 'open' });
    }
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ type: 'message', data });
    }
  }

  simulateError(error = new Error('Socket error')) {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  simulateClose(code = 1006, reason = 'Abnormal closure') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  send(data) {
    this.sentData.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

describe('ReconnectingSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles state transitions: connecting -> open -> reconnecting -> open', async () => {
    const stateTransitions = [];
    const getUrl = vi.fn().mockResolvedValue('ws://localhost:8000/ws/test');

    const socket = new ReconnectingSocket({
      getUrl,
      onStateChange: (state) => stateTransitions.push(state),
      WebSocketClass: MockWebSocket,
      minDelay: 1000,
      jitterFactor: 0,
    });

    expect(stateTransitions).toEqual(['connecting']);
    expect(socket.getState()).toBe('connecting');

    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate connection established
    MockWebSocket.instances[0].simulateOpen();
    expect(stateTransitions).toEqual(['connecting', 'open']);
    expect(socket.getState()).toBe('open');

    // Simulate unexpected drop
    MockWebSocket.instances[0].simulateClose(1006, 'Connection lost');
    expect(stateTransitions).toEqual(['connecting', 'open', 'reconnecting']);
    expect(socket.getState()).toBe('reconnecting');

    // Advance timer past backoff delay (1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances.length).toBe(2);

    // Simulate re-connection open
    MockWebSocket.instances[1].simulateOpen();
    expect(stateTransitions).toEqual(['connecting', 'open', 'reconnecting', 'open']);
    expect(socket.getState()).toBe('open');

    socket.close();
  });

  it('follows exponential backoff sequence (1s -> 2s -> 4s -> 8s -> 10s max)', async () => {
    let tokenCounter = 1;
    const urls = [];
    const getUrl = vi.fn().mockImplementation(async () => {
      const url = `ws://localhost:8000/ws/session?token=token_${tokenCounter++}`;
      urls.push(url);
      return url;
    });

    const socket = new ReconnectingSocket({
      getUrl,
      WebSocketClass: MockWebSocket,
      minDelay: 1000,
      maxDelay: 10000,
      jitterFactor: 0,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(1);

    // Attempt 1 fails -> backoff should be 1000ms
    MockWebSocket.instances[0].simulateClose(1006);
    expect(MockWebSocket.instances.length).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(MockWebSocket.instances.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(2);

    // Attempt 2 fails -> backoff should be 2000ms
    MockWebSocket.instances[1].simulateClose(1006);
    await vi.advanceTimersByTimeAsync(1999);
    expect(MockWebSocket.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(3);

    // Attempt 3 fails -> backoff should be 4000ms
    MockWebSocket.instances[2].simulateClose(1006);
    await vi.advanceTimersByTimeAsync(3999);
    expect(MockWebSocket.instances.length).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(4);

    // Attempt 4 fails -> backoff should be 8000ms
    MockWebSocket.instances[3].simulateClose(1006);
    await vi.advanceTimersByTimeAsync(7999);
    expect(MockWebSocket.instances.length).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(5);

    // Attempt 5 fails -> backoff should cap at 10000ms
    MockWebSocket.instances[4].simulateClose(1006);
    await vi.advanceTimersByTimeAsync(9999);
    expect(MockWebSocket.instances.length).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(6);

    // Verify each attempt generated a fresh URL from the factory
    expect(urls).toEqual([
      'ws://localhost:8000/ws/session?token=token_1',
      'ws://localhost:8000/ws/session?token=token_2',
      'ws://localhost:8000/ws/session?token=token_3',
      'ws://localhost:8000/ws/session?token=token_4',
      'ws://localhost:8000/ws/session?token=token_5',
      'ws://localhost:8000/ws/session?token=token_6',
    ]);

    socket.close();
  });

  it('refreshes token once on auth failure (1008 / 4401), then fails if auth error recurs', async () => {
    let tokenIndex = 1;
    const getUrl = vi.fn().mockImplementation(async () => `ws://localhost:8000/ws?token=${tokenIndex++}`);
    const stateTransitions = [];
    const errors = [];

    const socket = new ReconnectingSocket({
      getUrl,
      onStateChange: (s) => stateTransitions.push(s),
      onError: (err) => errors.push(err),
      WebSocketClass: MockWebSocket,
      minDelay: 1000,
      jitterFactor: 0,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(1);

    // First auth failure with 4401: triggers immediate token refresh retry
    MockWebSocket.instances[0].simulateClose(4401, 'Unauthorized');
    expect(stateTransitions).toContain('reconnecting');

    // Run ticks to resolve immediate reconnect
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(2);
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8000/ws?token=2');

    // Second auth failure with 1008: should not retry, must transition to failed and surface error
    MockWebSocket.instances[1].simulateClose(1008, 'Policy Violation');
    expect(socket.getState()).toBe('failed');
    expect(stateTransitions[stateTransitions.length - 1]).toBe('failed');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('WebSocket authentication failed permanently');

    // Verify no further retries are scheduled
    await vi.advanceTimersByTimeAsync(20000);
    expect(MockWebSocket.instances.length).toBe(2);

    socket.close();
  });

  it('does not retry after an intentional close', async () => {
    const getUrl = vi.fn().mockResolvedValue('ws://localhost:8000/ws');
    const stateTransitions = [];

    const socket = new ReconnectingSocket({
      getUrl,
      onStateChange: (s) => stateTransitions.push(s),
      WebSocketClass: MockWebSocket,
      minDelay: 1000,
      jitterFactor: 0,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(1);

    MockWebSocket.instances[0].simulateOpen();
    expect(socket.getState()).toBe('open');

    // Intentional close
    socket.close(1000, 'User left exam');

    // Advance time - no new socket should be created
    await vi.advanceTimersByTimeAsync(15000);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(stateTransitions).not.toContain('reconnecting');
  });

  it('sends data when open and ignores send when not open', async () => {
    const getUrl = vi.fn().mockResolvedValue('ws://localhost:8000/ws');
    const socket = new ReconnectingSocket({
      getUrl,
      WebSocketClass: MockWebSocket,
    });

    await vi.advanceTimersByTimeAsync(0);
    const ws = MockWebSocket.instances[0];

    // While connecting, send returns false
    expect(socket.send(JSON.stringify({ type: 'HEARTBEAT' }))).toBe(false);
    expect(ws.sentData).toEqual([]);

    // Once open, send succeeds
    ws.simulateOpen();
    expect(socket.send(JSON.stringify({ type: 'HEARTBEAT' }))).toBe(true);
    expect(ws.sentData).toEqual([JSON.stringify({ type: 'HEARTBEAT' })]);

    socket.close();
  });
});
