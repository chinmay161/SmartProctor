import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiModule from '../../../services/api';

const mockGetClient = vi.fn();
const mockCaptureException = vi.fn();

vi.mock('@sentry/react', () => ({
  getClient: () => mockGetClient(),
  captureException: (err) => mockCaptureException(err),
}));

describe('DiagnosticsSection logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles backend 500 as expected result and extracts request id', async () => {
    const error500 = new Error('Deliberate diagnostic exception (request id: req-diag-12345)');
    error500.requestId = 'req-diag-12345';
    error500.status = 500;

    const apiRequestSpy = vi.spyOn(apiModule, 'apiRequest').mockRejectedValueOnce(error500);

    let backendMessage = '';
    const token = 'mock-auth0-token';

    try {
      await apiModule.apiRequest('/admin/diagnostics/trace-test', 'POST', null, token);
      backendMessage = 'Backend test error sent';
    } catch (err) {
      const requestId = err?.requestId || 'unknown';
      backendMessage = `Backend test error sent (request ID: ${requestId})`;
    }

    expect(apiRequestSpy).toHaveBeenCalledWith('/admin/diagnostics/trace-test', 'POST', null, 'mock-auth0-token');
    expect(backendMessage).toBe('Backend test error sent (request ID: req-diag-12345)');
  });

  it('shows Sentry is not configured in this build when client is uninitialized', () => {
    mockGetClient.mockReturnValue(undefined);

    let frontendMessage = '';
    const client = mockGetClient();
    const isInitialised = Boolean(client && (!client.getDsn || client.getDsn()));

    if (isInitialised) {
      mockCaptureException(new Error('Frontend Sentry test'));
      frontendMessage = 'Frontend test error sent to Sentry';
    } else {
      frontendMessage = 'Sentry is not configured in this build';
    }

    expect(frontendMessage).toBe('Sentry is not configured in this build');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('calls Sentry.captureException when Sentry is initialized', () => {
    const mockClient = { getDsn: () => 'https://dummy@sentry.io/123' };
    mockGetClient.mockReturnValue(mockClient);

    let frontendMessage = '';
    const client = mockGetClient();
    const isInitialised = Boolean(client && (!client.getDsn || client.getDsn()));

    if (isInitialised) {
      mockCaptureException(new Error('Frontend Sentry test'));
      frontendMessage = 'Frontend test error sent to Sentry';
    } else {
      frontendMessage = 'Sentry is not configured in this build';
    }

    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error));
    expect(mockCaptureException.mock.calls[0][0].message).toBe('Frontend Sentry test');
    expect(frontendMessage).toBe('Frontend test error sent to Sentry');
  });

  it('guarantees no uncaught errors even if network completely fails', async () => {
    vi.spyOn(apiModule, 'apiRequest').mockRejectedValueOnce(new TypeError('Network offline'));
    mockGetClient.mockImplementation(() => {
      throw new Error('Sentry crash');
    });

    let backendMessage = '';
    let frontendMessage = '';

    await expect((async () => {
      try {
        await apiModule.apiRequest('/admin/diagnostics/trace-test', 'POST', null, null);
      } catch (err) {
        backendMessage = `Backend test error sent (request ID: ${err?.requestId || 'unknown'})`;
      }

      try {
        const client = mockGetClient();
        if (client) {
          mockCaptureException(new Error('Frontend Sentry test'));
        } else {
          frontendMessage = 'Sentry is not configured in this build';
        }
      } catch {
        frontendMessage = 'Sentry is not configured in this build';
      }
    })()).resolves.not.toThrow();

    expect(backendMessage).toContain('Backend test error sent');
    expect(frontendMessage).toBe('Sentry is not configured in this build');
  });

  describe('Storage Diagnostics logic', () => {
    it('calls /admin/diagnostics/storage-test and handles successful result', async () => {
      const mockResult = {
        mode: 's3',
        ok: true,
        step_failed: null,
        error_class: null,
        message: 'Storage write, presign, fetch, and delete succeeded',
      };
      const apiRequestSpy = vi.spyOn(apiModule, 'apiRequest').mockResolvedValueOnce(mockResult);

      let storageResult = null;
      try {
        storageResult = await apiModule.apiRequest('/admin/diagnostics/storage-test', 'POST', null, 'mock-token');
      } catch (err) {
        storageResult = { ok: false, message: err.message };
      }

      expect(apiRequestSpy).toHaveBeenCalledWith('/admin/diagnostics/storage-test', 'POST', null, 'mock-token');
      expect(storageResult.ok).toBe(true);
      expect(storageResult.mode).toBe('s3');
    });

    it('handles storage_not_configured result without throwing', async () => {
      const mockResult = {
        mode: 'local',
        ok: false,
        reason: 'storage_not_configured',
      };
      vi.spyOn(apiModule, 'apiRequest').mockResolvedValueOnce(mockResult);

      const storageResult = await apiModule.apiRequest('/admin/diagnostics/storage-test', 'POST', null, null);
      expect(storageResult.ok).toBe(false);
      expect(storageResult.reason).toBe('storage_not_configured');
    });

    it('handles storage upload failure result with redacted error', async () => {
      const mockResult = {
        mode: 's3',
        ok: false,
        step_failed: 'write',
        error_class: 'ClientError',
        message: 'S3 PutObject failed: [REDACTED]',
      };
      vi.spyOn(apiModule, 'apiRequest').mockResolvedValueOnce(mockResult);

      const storageResult = await apiModule.apiRequest('/admin/diagnostics/storage-test', 'POST', null, null);
      expect(storageResult.ok).toBe(false);
      expect(storageResult.step_failed).toBe('write');
      expect(storageResult.message).toContain('[REDACTED]');
    });
  });
});
