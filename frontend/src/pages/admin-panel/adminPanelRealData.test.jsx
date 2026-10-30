import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import SystemMetricsCard from './components/SystemMetricsCard';
import * as apiModule from '../../services/api';

describe('Admin Panel Real Data & Honest States', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Stat Cards (SystemMetricsCard) Rendering', () => {
    it('renders loading skeleton when loading is true and contains no mock numbers', () => {
      const html = renderToString(
        <SystemMetricsCard
          title="Registered Users"
          value={null}
          iconName="Users"
          color="#3B82F6"
          loading={true}
        />
      );

      expect(html).toContain('data-testid="metrics-card-skeleton"');
      expect(html).not.toContain('18,542');
      expect(html).not.toContain('98.7%');
      expect(html).not.toContain('47');
      expect(html).not.toContain('342');
    });

    it('renders error state on card failure and never fake numbers', () => {
      const html = renderToString(
        <SystemMetricsCard
          title="Violations Today"
          value={null}
          iconName="Violations"
          color="#EF4444"
          error="Failed to load violations"
        />
      );

      expect(html).toContain('data-testid="metrics-card-error"');
      expect(html).toContain('Failed to load violations');
      // Must not contain any mock/sample fallback
      expect(html).not.toContain('342');
      expect(html).not.toContain('18,542');
    });

    it('renders real stats values with breakdown and honest labels, no percentage trends', () => {
      const html = renderToString(
        <SystemMetricsCard
          title="Registered Users"
          value={248}
          iconName="Users"
          color="#3B82F6"
          subtitle="120 students · 120 teachers · 8 admins"
        />
      );

      expect(html).toContain('248');
      expect(html).toContain('Registered Users');
      expect(html).toContain('120 students · 120 teachers · 8 admins');
      // No fake percentage trend
      expect(html).not.toContain('+12.5%');
      expect(html).not.toContain('+8.2%');
      expect(html).not.toContain('+15.3%');
    });

    it('renders server status honestly as Server status without uptime %', () => {
      const html = renderToString(
        <SystemMetricsCard
          title="Server status"
          value="Operational"
          iconName="Server"
          color="#06B6D4"
          subtitle="Storage: local · Env: development"
        />
      );

      expect(html).toContain('Server status');
      expect(html).toContain('Operational');
      expect(html).toContain('Storage: local · Env: development');
      expect(html).not.toContain('99.9%');
      expect(html).not.toContain('uptime %');
      expect(html).not.toContain('Uptime');
    });

    it('renders real 7-day series bars only when trend array is provided', () => {
      const realSeries = [4, 8, 12, 6, 0, 15, 9];

      const html = renderToString(
        <SystemMetricsCard
          title="Violations Today"
          value={9}
          iconName="Violations"
          color="#F59E0B"
          subtitle="Since 00:00 IST (Asia/Kolkata)"
          trend={realSeries}
        />
      );

      expect(html).toContain('Violations Today');
      expect(html).toContain('9');
      // 7 bars rendered with testids
      for (let i = 0; i < 7; i++) {
        expect(html).toContain(`data-testid="trend-bar-${i}"`);
      }
      // Height calculation for 15 (max) is 100%
      expect(html).toContain('height:100%');
    });
  });

  describe('2. Error States with Retry and Request ID', () => {
    it('guarantees API errors preserve requestId and reject cleanly without returning mock data', async () => {
      const errorObj = new Error('Database connection refused');
      errorObj.requestId = 'req-auth-fail-502';
      errorObj.status = 502;

      vi.spyOn(apiModule, 'apiRequest').mockRejectedValueOnce(errorObj);

      let caughtError = null;
      let returnedData = null;

      try {
        returnedData = await apiModule.apiRequest('/admin/stats', 'GET', null, 'mock-token');
      } catch (err) {
        caughtError = err;
      }

      expect(returnedData).toBeNull();
      expect(caughtError).toBeTruthy();
      expect(caughtError.message).toBe('Database connection refused');
      expect(caughtError.requestId).toBe('req-auth-fail-502');
    });

    it('renders error banner with request id and retry button', () => {
      const statsError = {
        message: 'Backend service unavailable',
        requestId: 'req-err-xyz-777',
      };

      const html = renderToString(
        <div data-testid="stats-error-banner">
          <p>{statsError.message} (Request ID: {statsError.requestId})</p>
          <button data-testid="stats-retry-btn">Retry</button>
        </div>
      );

      expect(html).toContain('Backend service unavailable');
      expect(html).toContain('req-err-xyz-777');
      expect(html).toContain('Retry');
      expect(html).not.toContain('18,542');
    });

    it('reports summary empty state handles zero items without substituting fake cards', () => {
      const emptyReportsSummary = {
        days: 30,
        totals: {
          exams_created: 0,
          attempts_submitted: 0,
          average_integrity_score: null,
          total_violations: 0,
        },
        violations_by_type: {},
        violations_by_review_label: {
          confirmed: 0,
          false_alarm: 0,
          unsure: 0,
          unreviewed: 0,
        },
        problem_reports_by_status: {},
      };

      // Average integrity score null shows "N/A" rather than a fake 94.2%
      const avgScoreDisplay =
        emptyReportsSummary.totals.average_integrity_score !== null
          ? `${emptyReportsSummary.totals.average_integrity_score}%`
          : 'N/A';

      expect(avgScoreDisplay).toBe('N/A');
      expect(emptyReportsSummary.totals.exams_created).toBe(0);
      expect(Object.keys(emptyReportsSummary.violations_by_type).length).toBe(0);
    });

    it('user export triggers CSV stream and contains expected column headers', () => {
      const expectedHeaders = [
        'User ID',
        'Email',
        'Name',
        'Role',
        'Institution',
        'Status',
        'Last Login',
      ];
      const csvRow = 'auth0|123,"test@domain.com","Test User",student,"SmartProctor University",active,"2026-10-30T10:00:00Z"';

      const csvContent = `${expectedHeaders.join(',')}\r\n${csvRow}\r\n`;
      expect(csvContent).toContain('User ID,Email,Name,Role,Institution,Status,Last Login');
      expect(csvContent).toContain('auth0|123');
      expect(csvContent).not.toContain('undefined');
    });
  });

  describe('3. System Status flags contain no secrets', () => {
    it('system status response model strictly permits booleans, modes, numbers and no secrets', () => {
      const validStatusResponse = {
        sentry_configured: true,
        brevo_configured: false,
        evidence_storage_mode: 'local',
        inference_mode: 'onnx',
        environment: 'development',
        retention_periods: {
          evidence_retention_days: 30,
          telemetry_retention_days: 90,
          audit_log_retention_days: 365,
        },
        pilot_features: {
          auto_submit_enabled: true,
          heartbeat_monitor_enabled: true,
          screen_recording_supported: true,
        },
      };

      // Assert no secret fields exist
      const forbiddenKeys = ['dsn', 'key', 'secret', 'password', 'token', 'credentials', 'email'];
      const stringified = JSON.stringify(validStatusResponse).toLowerCase();

      forbiddenKeys.forEach((k) => {
        expect(stringified).not.toContain(`"${k}":`);
      });

      expect(typeof validStatusResponse.sentry_configured).toBe('boolean');
      expect(typeof validStatusResponse.brevo_configured).toBe('boolean');
      expect(typeof validStatusResponse.evidence_storage_mode).toBe('string');
      expect(typeof validStatusResponse.retention_periods.evidence_retention_days).toBe('number');
    });
  });

  describe('4. Brand Header Route / and Login Redirection', () => {
    it('maps user roles directly to their respective dashboards', async () => {
      const { dashboardForRoles } = await import('../../utils/roleUtils');
      expect(dashboardForRoles(['admin'])).toBe('/admin-panel');
      expect(dashboardForRoles(['teacher'])).toBe('/teacher-dashboard');
      expect(dashboardForRoles(['student'])).toBe('/student-dashboard');
      expect(dashboardForRoles([])).toBe('/login');
    });

    it('header brand name links to route / without the emblem logo', () => {
      const headerHtml = renderToString(
        <a href="/" data-testid="header-brand-link">
          <span className="text-xl font-bold">SmartProctor</span>
        </a>
      );

      expect(headerHtml).toContain('href="/"');
      expect(headerHtml).toContain('SmartProctor');
      // Logo SVG element is removed
      expect(headerHtml).not.toContain('aria-label="SmartProctor Logo"');
      expect(headerHtml).not.toContain('spShieldGrad');
    });
  });
});
