import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../../services/authAwareCall';

const CATEGORY_COLORS = {
  camera: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', border: 'rgba(239,68,68,0.25)' },
  microphone: { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
  fullscreen: { bg: 'rgba(59,130,246,0.1)', text: '#3B82F6', border: 'rgba(59,130,246,0.25)' },
  screen_share: { bg: 'rgba(168,85,247,0.1)', text: '#A855F7', border: 'rgba(168,85,247,0.25)' },
  questions: { bg: 'rgba(16,185,129,0.1)', text: '#10B981', border: 'rgba(16,185,129,0.25)' },
  login: { bg: 'rgba(236,72,153,0.1)', text: '#EC4899', border: 'rgba(236,72,153,0.25)' },
  other: { bg: 'rgba(107,114,128,0.1)', text: '#9CA3AF', border: 'rgba(107,114,128,0.25)' },
};

const ProblemReportsTab = () => {
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  // Events inspection modal state
  const [inspectingReport, setInspectingReport] = useState(null);
  const [traceEvents, setTraceEvents] = useState([]);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceError, setTraceError] = useState('');

  const callApi = ({ path, method = 'GET', body = null }) =>
    authAwareCall({
      path,
      method,
      body,
      auth0Authenticated,
      getAccessTokenSilently,
      auth0Audience,
    });

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      let query = `?page=${page}&page_size=${pageSize}`;
      if (statusFilter && statusFilter !== 'ALL') {
        query += `&status=${encodeURIComponent(statusFilter)}`;
      }
      const data = await callApi({ path: `/admin/problem-reports${query}` });
      setReports(data?.reports || []);
      setTotal(data?.total || 0);
    } catch (err) {
      setError(err?.detail || err?.message || 'Failed to load problem reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const handleMarkResolved = async (reportId) => {
    setResolvingId(reportId);
    try {
      await callApi({
        path: `/admin/problem-reports/${encodeURIComponent(reportId)}`,
        method: 'PATCH',
        body: { status: 'RESOLVED' },
      });
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'RESOLVED' } : r))
      );
    } catch (err) {
      alert(err?.detail || err?.message || 'Failed to update problem report');
    } finally {
      setResolvingId(null);
    }
  };

  const handleInspectTrace = async (report) => {
    setInspectingReport(report);
    setTraceEvents([]);
    setTraceError('');
    if (!report.trace_id) {
      setTraceError('No trace_id associated with this report.');
      return;
    }

    setLoadingTrace(true);
    try {
      const data = await callApi({ path: `/telemetry/trace/${encodeURIComponent(report.trace_id)}` });
      setTraceEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setTraceError(err?.detail || err?.message || 'Failed to fetch trace events');
    } finally {
      setLoadingTrace(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>
            Filter Status:
          </span>
          {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-body)',
                fontWeight: statusFilter === st ? 600 : 400,
                cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: statusFilter === st ? 'var(--sp-accent)' : 'transparent',
                color: statusFilter === st ? '#fff' : 'var(--color-muted-foreground)',
                transition: 'all 0.15s',
              }}
            >
              {st}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-foreground)',
          }}
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Reports Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(59,130,246,0.03)' }}>
              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted-foreground)', textTransform: 'uppercase' }}>Category</th>
              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted-foreground)', textTransform: 'uppercase' }}>Problem Description</th>
              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted-foreground)', textTransform: 'uppercase' }}>Page & Version</th>
              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted-foreground)', textTransform: 'uppercase' }}>Reported At</th>
              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted-foreground)', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted-foreground)', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-muted-foreground)', fontSize: '0.85rem' }}>
                  Loading problem reports...
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-muted-foreground)', fontSize: '0.85rem' }}>
                  No problem reports found.
                </td>
              </tr>
            ) : (
              reports.map((r) => {
                const catColor = CATEGORY_COLORS[r.category] || CATEGORY_COLORS.other;
                const isResolved = r.status === 'RESOLVED';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          background: catColor.bg,
                          color: catColor.text,
                          border: `1px solid ${catColor.border}`,
                        }}
                      >
                        {r.category}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top', maxWidth: '340px' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-foreground)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {r.text}
                      </p>
                      {r.student_id && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--color-muted-foreground)' }}>
                          Student: {r.student_id}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-foreground)', fontFamily: 'var(--font-data)' }}>
                        {r.page_path || '/'}
                      </p>
                      {r.app_version && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-muted-foreground)' }}>v{r.app_version}</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-muted-foreground)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: isResolved ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: isResolved ? '#10B981' : '#F59E0B',
                          border: `1px solid ${isResolved ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleInspectTrace(r)}
                          style={{
                            padding: '4px 9px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            border: '1px solid var(--color-border)',
                            background: 'transparent',
                            color: 'var(--sp-accent)',
                            cursor: 'pointer',
                          }}
                        >
                          View Events
                        </button>
                        {!isResolved && (
                          <button
                            type="button"
                            onClick={() => handleMarkResolved(r.id)}
                            disabled={resolvingId === r.id}
                            style={{
                              padding: '4px 9px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              border: '1px solid rgba(16,185,129,0.3)',
                              background: 'rgba(16,185,129,0.1)',
                              color: '#10B981',
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                          >
                            {resolvingId === r.id ? 'Saving...' : 'Resolve'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-foreground)', cursor: 'pointer' }}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted-foreground)' }}>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-foreground)', cursor: 'pointer' }}
          >
            Next
          </button>
        </div>
      )}

      {/* Trace / Session events inspection modal */}
      {inspectingReport && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setInspectingReport(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '800px',
              maxHeight: '85vh',
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-foreground)' }}>
                  Flight Recorder Trace Events
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>
                  Trace ID: {inspectingReport.trace_id || 'None'}
                  {inspectingReport.session_id ? ` • Session ID: ${inspectingReport.session_id}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingReport(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-muted-foreground)', fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              {loadingTrace ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted-foreground)', fontSize: '0.85rem' }}>
                  Loading trace events...
                </div>
              ) : traceError ? (
                <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: '0.85rem' }}>
                  {traceError}
                </div>
              ) : traceEvents.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted-foreground)', fontSize: '0.85rem' }}>
                  No flight recorder events found for this trace.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {traceEvents.map((evt) => (
                    <div
                      key={evt.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(59,130,246,0.03)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--sp-accent)' }}>#{evt.seq}</span>
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)', color: 'var(--sp-accent)', fontSize: '0.7rem', fontWeight: 600 }}>
                            {evt.category}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>{evt.name}</span>
                        </div>
                        {evt.data && Object.keys(evt.data).length > 0 && (
                          <pre style={{ margin: 0, padding: '4px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.15)', fontSize: '0.72rem', color: 'var(--color-muted-foreground)', overflowX: 'auto', maxHeight: '100px' }}>
                            {JSON.stringify(evt.data, null, 2)}
                          </pre>
                        )}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
                        {evt.server_ts ? new Date(evt.server_ts).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProblemReportsTab;
