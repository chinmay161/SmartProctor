// Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
/**
 * Flight Recorder: Per-session client telemetry buffer and flusher.
 * Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
 * Buffer capped at 500 events (drop oldest, tracks dropped count).
 * Flushes every 10s and on pagehide with keepalive (batches under 60 KB).
 * Persists unsent buffer in sessionStorage (capped) to survive reload within the same trace.
 * Must NEVER throw and never block the UI.
 * Recording must not create violations or trigger fullscreen or blur handling.
 */
import { getPlatformSessionMetadata } from './platformInfo';

const BUFFER_CAP = 500;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH_EVENTS = 100;
const MAX_BATCH_BYTES = 58 * 1024; // 58 KB strictly under 60 KB
const MAX_STORAGE_ITEMS = 100;
const STORAGE_KEY = 'sp_flight_recorder_state';

const FORBIDDEN_KEY_NAMES = ['token', 'authorization', 'image', 'audio', 'base64', 'answer', 'email'];

/**
 * Client-side sanitization.
 * Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
 */
export function sanitizeData(data, depth = 0) {
  if (depth > 4 || data == null) return null;
  if (typeof data === 'number' || typeof data === 'boolean') return data;
  if (typeof data === 'string') return data.slice(0, 512);
  if (Array.isArray(data)) {
    return data.slice(0, 50).map((item) => sanitizeData(item, depth + 1));
  }
  if (typeof data === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      const lower = String(k).trim().toLowerCase();
      if (FORBIDDEN_KEY_NAMES.some((forbidden) => lower.includes(forbidden))) {
        continue;
      }
      out[String(k).slice(0, 64)] = sanitizeData(v, depth + 1);
    }
    return out;
  }
  return null;
}

export function generateTraceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class FlightRecorder {
  constructor() {
    this.buffer = [];
    this.droppedCount = 0;
    this.seq = 0;
    this.traceId = null;
    this.sessionId = null;
    this.examId = null;
    this.kind = 'exam';
    this.getAccessToken = null;
    this.flushTimer = null;
    this.flushing = false;
    this.backoffMs = 1000;
    this.retryTimeout = null;

    this.initFromStorage();
  }

  initFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.traceId) this.traceId = parsed.traceId;
        if (parsed.sessionId) this.sessionId = parsed.sessionId;
        if (parsed.examId) this.examId = parsed.examId;
        if (parsed.kind) this.kind = parsed.kind;
        if (typeof parsed.seq === 'number') this.seq = parsed.seq;
        if (Array.isArray(parsed.buffer)) {
          this.buffer = parsed.buffer.slice(-BUFFER_CAP);
        }
      }
    } catch {
      // Storage unavailable or parse error — ignore safely
    }
  }

  saveToStorage() {
    try {
      if (this.kind === 'device_test' && !this.getAccessToken) return;
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const toStore = {
        traceId: this.traceId,
        sessionId: this.sessionId,
        examId: this.examId,
        kind: this.kind,
        seq: this.seq,
        buffer: this.buffer.slice(-MAX_STORAGE_ITEMS),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // Storage quota or error — ignore safely
    }
  }

  init({ traceId, sessionId, examId, kind = 'exam', getAccessToken } = {}) {
    try {
      if (traceId) {
        this.traceId = traceId;
      } else if (!this.traceId) {
        this.traceId = generateTraceId();
      }

      if (sessionId) this.sessionId = sessionId;
      if (examId) this.examId = examId;
      if (kind) this.kind = kind;
      if (getAccessToken !== undefined) this.getAccessToken = getAccessToken;

      this.saveToStorage();

      if (typeof window !== 'undefined' && !this.flushTimer) {
        this.flushTimer = setInterval(() => {
          void this.flush();
        }, FLUSH_INTERVAL_MS);

        window.addEventListener('pagehide', () => {
          this.flush({ keepalive: true });
        });
      }
    } catch {
      // Never throw
    }
  }

  setSessionId(id) {
    this.sessionId = id;
    this.saveToStorage();
  }

  setExamId(id) {
    this.examId = id;
    this.saveToStorage();
  }

  setAccessTokenGetter(fn) {
    this.getAccessToken = fn;
    if (this.kind === 'device_test' && !fn) {
      this.buffer = [];
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // safe
      }
    }
  }

  getTraceId() {
    if (!this.traceId) {
      this.traceId = generateTraceId();
      this.saveToStorage();
    }
    return this.traceId;
  }

  /**
   * Record a telemetry event.
   * Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
   */
  record(category, name, data = null) {
    try {
      // Telemetry must be dropped (not queued in sessionStorage) when there is no token in device tests
      if (this.kind === 'device_test' && !this.getAccessToken) {
        return;
      }

      if (!this.traceId) {
        this.traceId = generateTraceId();
      }

      const lowerName = String(name).toLowerCase();
      const isSessionStart = lowerName === 'exam_start' ||
        lowerName === 'session_start' ||
        lowerName === 'session-start' ||
        lowerName === 'resume';

      let enrichedData = data;
      if (isSessionStart) {
        const platformMeta = getPlatformSessionMetadata();
        if (data && typeof data === 'object') {
          enrichedData = { ...platformMeta, ...data };
        } else {
          enrichedData = { ...platformMeta };
        }
      }

      this.seq += 1;
      const sanitized = enrichedData !== null ? sanitizeData(enrichedData) : null;
      const event = {
        seq: this.seq,
        client_ts: Date.now(),
        category: String(category).toLowerCase(),
        name: String(name),
        data: sanitized,
      };

      if (this.buffer.length >= BUFFER_CAP) {
        this.buffer.shift();
        this.droppedCount += 1;
      }

      this.buffer.push(event);
      this.saveToStorage();
    } catch {
      // Never throw and never block UI
    }
  }

  recordSessionStart(data = {}, { name = 'exam_start', category = 'lifecycle' } = {}) {
    const meta = getPlatformSessionMetadata();
    const payload = { ...meta, ...data };
    this.record(category, name, payload);
    return payload;
  }

  async getAuthHeader() {
    try {
      if (typeof this.getAccessToken === 'function') {
        const token = await this.getAccessToken();
        if (token) return `Bearer ${token}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  async flush({ keepalive = false } = {}) {
    if (this.buffer.length === 0 || (this.flushing && !keepalive)) return;

    // Dropped without token in device tests: no network calls to authenticated endpoints, no retry storms
    if (this.kind === 'device_test') {
      const authHeader = await this.getAuthHeader();
      if (!authHeader) {
        this.buffer = [];
        this.flushing = false;
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          // safe
        }
        return;
      }
    }

    this.flushing = true;

    try {
      // Select batch: up to 100 items AND under MAX_BATCH_BYTES (58 KB)
      const batch = [];
      let currentBytes = 0;

      for (let i = 0; i < Math.min(this.buffer.length, MAX_BATCH_EVENTS); i += 1) {
        const item = this.buffer[i];
        const itemStr = JSON.stringify(item);
        const itemBytes = itemStr.length;
        if (batch.length > 0 && currentBytes + itemBytes > MAX_BATCH_BYTES) {
          break;
        }
        batch.push(item);
        currentBytes += itemBytes;
      }

      if (batch.length === 0) {
        this.flushing = false;
        return;
      }

      const payload = {
        trace_id: this.getTraceId(),
        session_id: this.sessionId || null,
        exam_id: this.examId || null,
        kind: this.kind || 'exam',
        events: batch,
      };

      const apiBase = (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_BASE || import.meta.env?.VITE_API_URL))
        || 'http://localhost:8000';
      const endpoint = `${apiBase.replace(/\/+$/, '')}/telemetry/events`;

      const headers = { 'Content-Type': 'application/json' };
      const authHeader = await this.getAuthHeader();
      if (authHeader) headers.Authorization = authHeader;

      const body = JSON.stringify(payload);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        keepalive: Boolean(keepalive),
      });

      if (res.ok) {
        // Success: drop sent items from buffer
        this.buffer.splice(0, batch.length);
        this.saveToStorage();
        this.backoffMs = 1000;

        // If buffer still has unsent items, schedule another flush soon
        if (this.buffer.length > 0 && !keepalive) {
          setTimeout(() => {
            void this.flush();
          }, 500);
        }
      } else if (res.status === 429) {
        // Rate limited: back off
        this.backoffMs = Math.min(30000, this.backoffMs * 2);
      } else {
        this.backoffMs = Math.min(30000, this.backoffMs * 2);
      }
    } catch {
      // Network failure or offline: retry with backoff
      this.backoffMs = Math.min(30000, this.backoffMs * 2);
    } finally {
      this.flushing = false;
    }
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }
}

// Global singleton instance
export { FlightRecorder, BUFFER_CAP, STORAGE_KEY };
export const flightRecorder = new FlightRecorder();

export default flightRecorder;
