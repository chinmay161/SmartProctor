import React, { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { apiRequest } from '../../../services/api';
import DiagnosticsSection from './DiagnosticsSection';

const SystemSettingsPanel = () => {
  const { getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);

  const fetchSystemStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let token = null;
      try {
        if (typeof getAccessTokenSilently === 'function') {
          token = await getAccessTokenSilently({
            authorizationParams: { audience: auth0Audience },
          });
        }
      } catch {
        // Continue if token acquisition fails; backend will return 401/403
      }

      const res = await apiRequest('/admin/system-status', 'GET', null, token);
      setSystemStatus(res);
    } catch (err) {
      setError({
        message: err?.message || 'Failed to fetch system status',
        requestId: err?.requestId || null,
      });
      setSystemStatus(null);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, auth0Audience]);

  useEffect(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  return (
    <div className="space-y-6" data-testid="system-settings-panel">
      {/* Error State */}
      {error && (
        <div
          className="bg-error/10 border border-error/30 rounded-lg p-4 text-error flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          data-testid="settings-error-state"
        >
          <div>
            <p className="font-medium text-sm">Failed to load system settings</p>
            <p className="text-xs text-error/80 mt-0.5">
              {error.message}
              {error.requestId && (
                <span className="font-mono ml-1 font-semibold">(Request ID: {error.requestId})</span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSystemStatus}
            data-testid="settings-retry-btn"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !error && (
        <div className="space-y-6 animate-pulse" data-testid="settings-skeletons">
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="h-6 w-48 bg-muted rounded"></div>
            <div className="h-4 w-72 bg-muted/60 rounded"></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="h-24 bg-muted/40 rounded-lg"></div>
              <div className="h-24 bg-muted/40 rounded-lg"></div>
              <div className="h-24 bg-muted/40 rounded-lg"></div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="h-6 w-52 bg-muted rounded"></div>
            <div className="space-y-3 pt-2">
              <div className="h-16 bg-muted/40 rounded-lg"></div>
              <div className="h-16 bg-muted/40 rounded-lg"></div>
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Status Content */}
      {!loading && !error && systemStatus && (
        <>
          {/* Runtime & Infrastructure */}
          <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                <Icon name="Server" size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-semibold text-foreground">
                  Runtime & Infrastructure
                </h3>
                <p className="text-sm text-muted-foreground">
                  Active environment, storage, and AI inference configuration flags (Read-only)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/20 border border-border rounded-lg">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Environment
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground capitalize">
                    {systemStatus.environment || 'Unknown'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                      systemStatus.environment === 'production'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {systemStatus.environment}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-muted/20 border border-border rounded-lg">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Evidence Storage Mode
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground uppercase">
                    {systemStatus.evidence_storage_mode || 'local'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent uppercase">
                    {systemStatus.evidence_storage_mode === 's3' ? 'Cloud Bucket' : 'Filesystem'}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-muted/20 border border-border rounded-lg">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  AI Inference Engine
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground uppercase">
                    {systemStatus.inference_mode || 'onnx'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* External Integrations */}
          <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
                <Icon name="Link" size={20} className="text-accent" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-semibold text-foreground">
                  External Service Integrations
                </h3>
                <p className="text-sm text-muted-foreground">
                  Configuration presence for critical third-party services (Keys & credentials are never exposed)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Icon name="Activity" size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Sentry Error Monitoring</p>
                    <p className="text-xs text-muted-foreground">
                      Application crash capture, frontend error reporting, and backend correlation
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    systemStatus.sentry_configured
                      ? 'bg-success/20 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                  data-testid="sentry-configured-badge"
                >
                  {systemStatus.sentry_configured ? 'Configured' : 'Not Configured'}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-accent/10 rounded-lg flex items-center justify-center">
                    <Icon name="Mail" size={18} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Brevo Email Delivery</p>
                    <p className="text-xs text-muted-foreground">
                      Transactional notifications, digest emails, and invitation links
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    systemStatus.brevo_configured
                      ? 'bg-success/20 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                  data-testid="brevo-configured-badge"
                >
                  {systemStatus.brevo_configured ? 'Configured' : 'Not Configured'}
                </span>
              </div>
            </div>
          </div>

          {/* Retention Periods */}
          <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
                <Icon name="Clock" size={20} className="text-success" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-semibold text-foreground">
                  Data Retention Policies
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enforced retention periods before automatic cleanup and pruning
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/20 border border-border rounded-lg">
                <p className="text-xs text-muted-foreground font-medium">Evidence Retention</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {systemStatus.retention_periods?.evidence_retention_days ?? '—'}
                  <span className="text-sm font-normal text-muted-foreground ml-1">days</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Webcam snapshots & screen frames</p>
              </div>

              <div className="p-4 bg-muted/20 border border-border rounded-lg">
                <p className="text-xs text-muted-foreground font-medium">Telemetry Retention</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {systemStatus.retention_periods?.telemetry_retention_days ?? '—'}
                  <span className="text-sm font-normal text-muted-foreground ml-1">days</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Heartbeat pings & window blur events</p>
              </div>

              <div className="p-4 bg-muted/20 border border-border rounded-lg">
                <p className="text-xs text-muted-foreground font-medium">Audit Log Retention</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {systemStatus.retention_periods?.audit_log_retention_days ?? '—'}
                  <span className="text-sm font-normal text-muted-foreground ml-1">days</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Administrative security actions</p>
              </div>
            </div>
          </div>

          {/* Pilot Features */}
          <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                <Icon name="Shield" size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-semibold text-foreground">
                  Active Pilot Features
                </h3>
                <p className="text-sm text-muted-foreground">
                  Proctoring system feature gates active on this environment
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/20 border border-border rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-Submit on Time Expiry</p>
                  <p className="text-xs text-muted-foreground">Enforces session deadline</p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    systemStatus.pilot_features?.auto_submit_enabled
                      ? 'bg-success/20 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {systemStatus.pilot_features?.auto_submit_enabled ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="p-4 bg-muted/20 border border-border rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Heartbeat Monitoring</p>
                  <p className="text-xs text-muted-foreground">Detects client disconnection</p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    systemStatus.pilot_features?.heartbeat_monitor_enabled
                      ? 'bg-success/20 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {systemStatus.pilot_features?.heartbeat_monitor_enabled ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="p-4 bg-muted/20 border border-border rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Screen Recording Support</p>
                  <p className="text-xs text-muted-foreground">Display capture pipeline</p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    systemStatus.pilot_features?.screen_recording_supported
                      ? 'bg-success/20 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {systemStatus.pilot_features?.screen_recording_supported ? 'Active' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Diagnostics Section (Keep existing test buttons) */}
      <DiagnosticsSection />
    </div>
  );
};

export default SystemSettingsPanel;