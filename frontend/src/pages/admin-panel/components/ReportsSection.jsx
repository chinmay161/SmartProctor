import React, { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { apiRequest } from '../../../services/api';

const DATE_RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 Days' },
  { value: 30, label: 'Last 30 Days' },
  { value: 90, label: 'Last 90 Days' },
  { value: 365, label: 'Last Year' },
];

const ReportsSection = () => {
  const { getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      const res = await apiRequest(`/admin/reports/summary?days=${days}`, 'GET', null, token);
      setData(res);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [auth0Audience, days, getAccessTokenSilently]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const violationsList = data?.violations_by_type || [];
  const totalViolations = violationsList.reduce((acc, curr) => acc + (curr.count || 0), 0);
  const maxViolationCount = Math.max(...violationsList.map((v) => v.count), 1);

  const reviewLabels = data?.violations_by_review_label || {
    confirmed: 0,
    false_alarm: 0,
    unsure: 0,
    unreviewed: 0,
  };

  const problemReports = data?.problem_reports_by_status || {};
  const problemEntries = Object.entries(problemReports);

  return (
    <div className="space-y-6" data-testid="reports-section">
      {/* Header filter banner */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
              <Icon name="BarChart3" size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-heading font-semibold text-foreground">Integrity & Activity Reports</h3>
              <p className="text-sm text-muted-foreground">Aggregated exam performance, review labels, and incident statistics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Period:</span>
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-smooth ${
                  days === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
                data-testid={`range-btn-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              iconName="RefreshCw"
              onClick={fetchReports}
              disabled={loading}
              title="Refresh reports"
              data-testid="reports-refresh-btn"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Error State with Retry Button and Request ID */}
      {error && !loading && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-center justify-between flex-wrap gap-3" data-testid="reports-error-banner">
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Failed to load reports summary</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {error.message || 'Error occurred while contacting backend.'}{' '}
              {error.requestId ? `(Request ID: ${error.requestId})` : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchReports} iconName="RefreshCw" data-testid="reports-retry-btn">
            Retry
          </Button>
        </div>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Exams Created */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
              <Icon name="FileText" size={20} />
            </div>
            <div>
              {loading ? (
                <div className="w-16 h-7 bg-muted rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-heading font-semibold text-foreground" data-testid="stat-exams-created">
                  {data?.exams_created !== undefined ? data.exams_created : '—'}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Exams Created</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Past {days} days</p>
        </div>

        {/* Attempts Submitted */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center text-success">
              <Icon name="CheckCircle" size={20} />
            </div>
            <div>
              {loading ? (
                <div className="w-16 h-7 bg-muted rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-heading font-semibold text-foreground" data-testid="stat-attempts-submitted">
                  {data?.attempts_submitted !== undefined ? data.attempts_submitted : '—'}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Attempts Submitted</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Completed exam submissions</p>
        </div>

        {/* Average Integrity Score */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center text-accent">
              <Icon name="Shield" size={20} />
            </div>
            <div>
              {loading ? (
                <div className="w-16 h-7 bg-muted rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-heading font-semibold text-foreground" data-testid="stat-avg-integrity">
                  {data?.average_integrity_score !== null && data?.average_integrity_score !== undefined
                    ? `${data.average_integrity_score}%`
                    : 'N/A'}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Avg Integrity Score</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Across evaluated attempts</p>
        </div>

        {/* Total Active Violations */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-md">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center text-warning">
              <Icon name="AlertTriangle" size={20} />
            </div>
            <div>
              {loading ? (
                <div className="w-16 h-7 bg-muted rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-heading font-semibold text-foreground" data-testid="stat-total-violations">
                  {totalViolations}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Flagged Violations</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Excludes false positives</p>
        </div>
      </div>

      {/* Review Labels Breakdown Card */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <h4 className="text-sm font-semibold text-foreground mb-4">Violations by Teacher Review Status</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg border border-border bg-error/10">
            <span className="text-xs font-medium text-error block mb-1">Confirmed Cheating</span>
            <span className="text-xl font-bold text-foreground" data-testid="review-confirmed">{reviewLabels.confirmed}</span>
          </div>
          <div className="p-3 rounded-lg border border-border bg-success/10">
            <span className="text-xs font-medium text-success block mb-1">False Alarm</span>
            <span className="text-xl font-bold text-foreground" data-testid="review-false-alarm">{reviewLabels.false_alarm}</span>
          </div>
          <div className="p-3 rounded-lg border border-border bg-warning/10">
            <span className="text-xs font-medium text-warning block mb-1">Unsure / Reviewing</span>
            <span className="text-xl font-bold text-foreground" data-testid="review-unsure">{reviewLabels.unsure}</span>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/40">
            <span className="text-xs font-medium text-muted-foreground block mb-1">Unreviewed</span>
            <span className="text-xl font-bold text-foreground" data-testid="review-unreviewed">{reviewLabels.unreviewed}</span>
          </div>
        </div>
      </div>

      {/* Two columns: Violations by Type & Problem Reports by Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violations by Type with simple bars */}
        <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
          <h4 className="text-sm font-semibold text-foreground mb-4">Violations by Incident Type</h4>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : violationsList.length === 0 ? (
            <div className="p-8 text-center" data-testid="violations-empty">
              <Icon name="CheckCircle" size={28} className="text-success mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No violations recorded in the selected period.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {violationsList.map((item) => {
                const pct = Math.round((item.count / maxViolationCount) * 100);
                return (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{item.type.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground font-mono">{item.count}</span>
                    </div>
                    <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-warning h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Problem Reports by Status */}
        <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
          <h4 className="text-sm font-semibold text-foreground mb-4">Problem Reports by Status</h4>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-9 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : problemEntries.length === 0 ? (
            <div className="p-8 text-center" data-testid="problem-reports-empty">
              <Icon name="Inbox" size={28} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No problem reports submitted in the selected period.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {problemEntries.map(([statusKey, count]) => (
                <div key={statusKey} className="py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{statusKey}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      statusKey === 'RESOLVED'
                        ? 'bg-success/20 text-success'
                        : 'bg-warning/20 text-warning'
                    }`}
                  >
                    {count} reports
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsSection;