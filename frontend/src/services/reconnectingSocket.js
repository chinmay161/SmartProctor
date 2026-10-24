/**
 * reconnectingSocket.js
 * Resilient WebSocket client with async URL factory, exponential backoff (1s -> 10s) with jitter,
 * single-attempt auth refresh recovery on 1008 / 4401, intentional close tracking,
 * and state notifications (connecting | open | reconnecting | failed).
 */

export class ReconnectingSocket {
  constructor({
    getUrl,
    onOpen,
    onMessage,
    onClose,
    onError,
    onStateChange,
    minDelay = 1000,
    maxDelay = 10000,
    jitterFactor = 0.2,
    WebSocketClass = (typeof WebSocket !== 'undefined' ? WebSocket : null),
  }) {
    if (typeof getUrl !== 'function') {
      throw new Error('reconnectingSocket requires a getUrl function');
    }

    this.getUrl = getUrl;
    this.onOpen = onOpen;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onError = onError;
    this.onStateChange = onStateChange;

    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
    this.jitterFactor = jitterFactor;
    this.WebSocketClass = WebSocketClass;

    this.state = 'connecting';
    this.currentDelay = this.minDelay;
    this.isClosed = false;
    this.hasRefreshedAuth = false;
    this.reconnectTimer = null;
    this.ws = null;

    this._notifyState('connecting');
    this._connect();
  }

  _notifyState(newState) {
    this.state = newState;
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange(newState);
      } catch (err) {
        console.error('[reconnectingSocket] onStateChange error:', err);
      }
    }
  }

  async _connect() {
    if (this.isClosed) return;

    let url;
    try {
      url = await this.getUrl();
    } catch (err) {
      if (this.isClosed) return;
      if (typeof this.onError === 'function') {
        this.onError(err);
      }
      this._scheduleReconnect();
      return;
    }

    if (this.isClosed) return;

    try {
      const SocketConstructor = this.WebSocketClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
      if (!SocketConstructor) {
        throw new Error('WebSocket is not supported in this environment');
      }

      this.ws = new SocketConstructor(url);
    } catch (err) {
      if (typeof this.onError === 'function') {
        this.onError(err);
      }
      this._scheduleReconnect();
      return;
    }

    const currentSocket = this.ws;

    currentSocket.onopen = (event) => {
      if (this.ws !== currentSocket || this.isClosed) return;

      this.currentDelay = this.minDelay;
      this.hasRefreshedAuth = false;
      this._notifyState('open');

      if (typeof this.onOpen === 'function') {
        this.onOpen(event, this);
      }
    };

    currentSocket.onmessage = (event) => {
      if (this.ws !== currentSocket || this.isClosed) return;

      if (typeof this.onMessage === 'function') {
        this.onMessage(event);
      }
    };

    currentSocket.onerror = (event) => {
      if (this.ws !== currentSocket || this.isClosed) return;

      if (typeof this.onError === 'function') {
        this.onError(event);
      }
    };

    currentSocket.onclose = (event) => {
      if (this.ws !== currentSocket) return;

      if (typeof this.onClose === 'function') {
        this.onClose(event);
      }

      if (this.isClosed) {
        return;
      }

      const isAuthFailure = event && (event.code === 1008 || event.code === 4401);
      if (isAuthFailure) {
        if (!this.hasRefreshedAuth) {
          // On auth-failure closes (1008 or 4401) refresh the token once
          this.hasRefreshedAuth = true;
          this._scheduleReconnect(true);
        } else {
          // Stop retrying and surface an error
          this._notifyState('failed');
          if (typeof this.onError === 'function') {
            this.onError(new Error(`WebSocket authentication failed permanently (code ${event.code})`));
          }
        }
        return;
      }

      this._scheduleReconnect();
    };
  }

  _scheduleReconnect(immediate = false) {
    if (this.isClosed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this._notifyState('reconnecting');

    let delay;
    if (immediate) {
      delay = 0;
    } else {
      const baseDelay = Math.min(this.currentDelay, this.maxDelay);
      const jitter = Math.floor(Math.random() * (baseDelay * this.jitterFactor));
      delay = Math.min(this.maxDelay, baseDelay + jitter);

      // Exponential backoff for next attempt: double the base delay up to maxDelay
      this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 2);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, delay);
  }

  send(data) {
    const readyState = this.ws ? this.ws.readyState : null;
    const OPEN_STATE = this.WebSocketClass?.OPEN ?? 1;

    if (this.ws && readyState === OPEN_STATE) {
      this.ws.send(data);
      return true;
    }
    return false;
  }

  close(code = 1000, reason = 'Intentional close') {
    this.isClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch {
        // Ignored if socket is already closed or closing
      }
      this.ws = null;
    }
  }

  getState() {
    return this.state;
  }

  getRawSocket() {
    return this.ws;
  }
}

export function createReconnectingSocket(options) {
  return new ReconnectingSocket(options);
}
