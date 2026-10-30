import React, { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { apiRequest } from '../../../services/api';

const ACTION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'assign', label: 'Role Assigned' },
  { value: 'replace', label: 'Role Replaced' },
  { value: 'remove', label: 'Role Removed' },
  { value: 'suspend_user', label: 'User Suspended' },
  { value: 'activate_user', label: 'User Activated' },
  { value: 'bulk_suspend', label: 'Bulk Suspend' },
  { value: 'bulk_activate', label: 'Bulk Activate' },
  { value: 'export_users', label: 'Data Export' },
];

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp);
  return date.toLocaleString();
};

const actionBadgeClass = (action) => {
  switch (action) {
    case 'assign':
    case 'activate_user':
    case 'bulk_activate':
      return 'bg-success/20 text-success';
    case 'suspend_user':
    case 'bulk_suspend':
    case 'remove':
      return 'bg-error/20 text-error';
    case 'replace':
    case 'export_users':
      return 'bg-primary/20 text-primary';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const SecurityMonitoring = () => {
  const { getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [actionFilter, setActionFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      let url = `/admin/audit-logs?page=${page}&page_size=${pageSize}`;
      if (actionFilter && actionFilter !== 'all') {
        url += `&action=${encodeURIComponent(actionFilter)}`;
      }
      const res = await apiRequest(url, 'GET', null, token);
      setLogs(res?.items || []);
      setTotal(Number(res?.total || 0));
    } catch (err) {
      setError(err);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, auth0Audience, getAccessTokenSilently, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(total, page * pageSize);

  return (
    <div className="space-y-6" data-testid="security-monitoring-panel">
      {/* Header filter card */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
              <Icon name="Shield" size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-heading font-semibold text-foreground">Administrative Audit Logs</h3>
              <p className="text-sm text-muted-foreground">Immutable audit trail of administrator role changes, status updates, and data exports</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              data-testid="audit-action-filter"
            >
              {ACTION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              iconName="RefreshCw"
              onClick={fetchLogs}
              disabled={loading}
              data-testid="audit-refresh-btn"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Error state with retry button and request ID */}
      {error && !loading && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-center justify-between flex-wrap gap-3" data-testid="audit-error-banner">
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Failed to load audit logs</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {error.message || 'Error occurred while contacting backend.'}{' '}
              {error.requestId ? `(Request ID: ${error.requestId})` : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} iconName="RefreshCw" data-testid="audit-retry-btn">
            Retry
          </Button>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Admin Actor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Target User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Details / Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} data-testid="audit-skeleton-row">
                    <td className="px-4 py-3.5"><div className="w-32 h-4 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="w-24 h-5 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="w-28 h-4 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3.5"><div className="w-32 h-4 bg-muted rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center" data-testid="audit-empty-state">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <Icon name="Shield" size={24} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No audit logs found</p>
                    <p className="text-xs text-muted-foreground mt-1">Administrative events will appear here once actions are performed.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-smooth">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center space-x-2">
                        <Icon name="User" size={14} className="text-primary shrink-0" />
                        <span className="text-sm font-medium text-foreground font-mono">{log.admin_email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${actionBadgeClass(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground font-mono">{log.target_user_id || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-foreground">{log.role || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground font-caption">{formatTimestamp(log.timestamp)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {startRow}-{endRow} of {total} audit logs
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              iconName="ChevronLeft"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              iconName="ChevronRight"
              iconPosition="right"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityMonitoring;