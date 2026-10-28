import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import * as Sentry from '@sentry/react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { apiRequest } from '../../../services/api';

const DiagnosticsSection = () => {
  const { getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(false);
  const [backendMessage, setBackendMessage] = useState('');
  const [frontendMessage, setFrontendMessage] = useState('');

  const [storageLoading, setStorageLoading] = useState(false);
  const [storageResult, setStorageResult] = useState(null);

  const handleTestStorage = async () => {
    setStorageLoading(true);
    setStorageResult(null);

    try {
      let token = null;
      try {
        if (typeof getAccessTokenSilently === 'function') {
          token = await getAccessTokenSilently({
            authorizationParams: { audience: auth0Audience },
          });
        }
      } catch {
        // Continue even if token acquisition encounters an issue
      }

      const res = await apiRequest('/admin/diagnostics/storage-test', 'POST', null, token);
      setStorageResult(res);
    } catch (err) {
      setStorageResult({
        ok: false,
        mode: 'unknown',
        step_failed: 'request',
        error_class: err?.name || 'NetworkError',
        message: err?.message || 'Failed to call storage-test endpoint',
      });
    } finally {
      setStorageLoading(false);
    }
  };

  const handleSendTestErrors = async () => {
    setLoading(true);
    setBackendMessage('');
    setFrontendMessage('');

    // (a) Backend trace test: POST /admin/diagnostics/trace-test
    // The 500 is the EXPECTED result; catch it and show "Backend test error sent" with the request id.
    try {
      let token = null;
      try {
        if (typeof getAccessTokenSilently === 'function') {
          token = await getAccessTokenSilently({
            authorizationParams: { audience: auth0Audience },
          });
        }
      } catch {
        // Continue even if token acquisition encounters an issue
      }

      try {
        await apiRequest('/admin/diagnostics/trace-test', 'POST', null, token);
        setBackendMessage('Backend test error sent');
      } catch (err) {
        const requestId = err?.requestId || 'unknown';
        setBackendMessage(`Backend test error sent (request ID: ${requestId})`);
      }
    } catch (unexpected) {
      const requestId = unexpected?.requestId || 'unknown';
      setBackendMessage(`Backend test error sent (request ID: ${requestId})`);
    }

    // (b) Frontend Sentry test: Sentry.captureException(new Error("Frontend Sentry test"))
    // if Sentry is initialised, otherwise show "Sentry is not configured in this build".
    try {
      const client = typeof Sentry?.getClient === 'function' ? Sentry.getClient() : null;
      const isInitialised = Boolean(
        client && (typeof client.getDsn !== 'function' || Boolean(client.getDsn()))
      );

      if (isInitialised) {
        Sentry.captureException(new Error('Frontend Sentry test'));
        setFrontendMessage('Frontend test error sent to Sentry');
      } else {
        setFrontendMessage('Sentry is not configured in this build');
      }
    } catch {
      setFrontendMessage('Sentry is not configured in this build');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md"
      data-testid="diagnostics-section"
    >
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
          <Icon name="Activity" size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-heading font-semibold text-foreground">Diagnostics</h3>
          <p className="text-sm text-muted-foreground">
            Test error tracking, request correlation, Sentry integration, and evidence storage
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send intentional backend and frontend test errors to verify error logging and correlation across services.
          </p>

          <div>
            <Button
              variant="outline"
              onClick={handleSendTestErrors}
              disabled={loading}
              data-testid="send-test-errors-btn"
            >
              {loading ? 'Sending test errors...' : 'Send test errors'}
            </Button>
          </div>

          {(backendMessage || frontendMessage) && (
            <div className="mt-4 p-3 rounded-md bg-muted/40 border border-border space-y-2 text-sm">
              {backendMessage && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">Backend:</span>
                  <span className="text-muted-foreground font-mono" data-testid="backend-test-status">
                    {backendMessage}
                  </span>
                </div>
              )}
              {frontendMessage && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">Frontend:</span>
                  <span className="text-muted-foreground" data-testid="frontend-sentry-status">
                    {frontendMessage}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Evidence Storage Testing */}
        <div className="pt-4 border-t border-border space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Evidence Storage (S3 / Supabase)</h4>
            <p className="text-sm text-muted-foreground">
              Test object storage write, signed URL generation, HTTP fetch, and deletion without raising 500 errors.
            </p>
          </div>

          <div>
            <Button
              variant="outline"
              onClick={handleTestStorage}
              disabled={storageLoading}
              data-testid="test-storage-btn"
            >
              {storageLoading ? 'Testing storage...' : 'Test storage'}
            </Button>
          </div>

          {storageResult && (
            <div
              className="mt-4 p-3 rounded-md bg-muted/40 border border-border space-y-2 text-sm"
              data-testid="storage-test-status"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Status:</span>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded ${
                    storageResult.ok ? 'bg-emerald-500/20 text-emerald-500' : 'bg-destructive/20 text-destructive'
                  }`}
                >
                  {storageResult.ok ? 'PASS' : 'FAIL'}
                </span>
                <span className="text-xs text-muted-foreground font-mono">mode: {storageResult.mode}</span>
              </div>
              {storageResult.reason && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">Reason:</span>
                  <span className="text-muted-foreground font-mono">{storageResult.reason}</span>
                </div>
              )}
              {storageResult.step_failed && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">Failed Step:</span>
                  <span className="text-destructive font-mono">{storageResult.step_failed}</span>
                </div>
              )}
              {storageResult.error_class && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">Error Class:</span>
                  <span className="text-muted-foreground font-mono">{storageResult.error_class}</span>
                </div>
              )}
              {storageResult.message && (
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground">Message:</span>
                  <span className="text-muted-foreground font-mono">{storageResult.message}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiagnosticsSection;
