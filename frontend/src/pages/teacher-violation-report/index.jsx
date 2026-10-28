import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import { apiRequest as httpApiRequest } from '../../services/httpClient';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import AppFooter from '../../components/ui/AppFooter';

const RAW_API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

const REVIEW_BADGES = {
  CONFIRMED: { label: 'Confirmed', bg: 'bg-destructive/15 text-destructive border-destructive/30' },
  FALSE_POSITIVE: { label: 'False Alarm', bg: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  UNSURE: { label: 'Unsure', bg: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  NONE: { label: 'Not Reviewed', bg: 'bg-muted text-muted-foreground border-border' },
};

const TeacherViolationReportPage = () => {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [expandedStudents, setExpandedStudents] = useState({});
  const [savingViolationId, setSavingViolationId] = useState(null);
  const [violationNotes, setViolationNotes] = useState({});

  const callApi = ({ path, method = 'GET', body = null }) =>
    authAwareCall({
      path,
      method,
      body,
      auth0Authenticated,
      getAccessTokenSilently,
      auth0Audience,
    });

  useEffect(() => {
    document.title = 'Violation Report - SmartProctor';
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadReport = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await callApi({
          path: `/exams/${encodeURIComponent(examId)}/violation-report?format=json&download=false`,
          method: 'GET',
        });
        if (mounted) setReport(data || null);
      } catch (err) {
        if (mounted) setError(err?.detail || err?.message || 'Failed to load violation report');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (examId) loadReport();
    return () => {
      mounted = false;
    };
  }, [examId, auth0Authenticated]);

  const toggleExpand = (studentId) => {
    setExpandedStudents((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const handleViolationReview = async (studentId, violationId, nextStatus) => {
    const currentNote = (violationNotes[violationId] !== undefined
      ? violationNotes[violationId]
      : '')?.trim();

    setSavingViolationId(violationId);
    try {
      const res = await callApi({
        path: `/violations/${encodeURIComponent(violationId)}/review`,
        method: 'PATCH',
        body: {
          review_status: nextStatus,
          review_note: currentNote,
        },
      });

      // Update in state
      setReport((prev) => {
        if (!prev) return prev;
        const nextRows = (prev.rows || []).map((row) => {
          if (row.student_id !== studentId) return row;
          const updatedViols = (row.violations || []).map((v) =>
            v.id === violationId
              ? { ...v, review_status: res.review_status, review_note: res.review_note }
              : v
          );
          // If all or any reviewed, update student level row if appropriate
          return {
            ...row,
            review_status: res.review_status,
            review_note: res.review_note || row.review_note,
            violations: updatedViols,
          };
        });
        return { ...prev, rows: nextRows };
      });
    } catch (err) {
      alert(err?.detail || err?.message || 'Failed to update review');
    } finally {
      setSavingViolationId(null);
    }
  };

  const downloadReport = async (format) => {
    setDownloading(format);
    setError('');
    try {
      const path = `/exams/${encodeURIComponent(examId)}/violation-report?format=${encodeURIComponent(format)}&download=true`;
      let blob;

      if (auth0Authenticated) {
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: auth0Audience,
          },
        });
        const response = await fetch(`${API_BASE}${path}`, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          throw new Error(`Failed to download ${format.toUpperCase()} report`);
        }
        blob = await response.blob();
      } else {
        blob = await httpApiRequest('GET', path, null, { responseType: 'blob' });
      }

      const fileExt = format === 'csv' ? 'csv' : 'json';
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `violation-report-${examId}.${fileExt}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.detail || err?.message || `Failed to download ${format.toUpperCase()} report`);
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <main className="pt-20 pb-8 flex-1">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground">Violation Report</h1>
            <p className="text-sm text-muted-foreground mt-1">{report?.exam_title || 'Detailed proctoring violations by student'}</p>
          </div>
          <Button variant="outline" iconName="ArrowLeft" onClick={() => navigate('/teacher-dashboard')}>
            Back to Teacher Dashboard
          </Button>
        </div>

        {!loading && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              iconName="FileSpreadsheet"
              loading={downloading === 'csv'}
              onClick={() => downloadReport('csv')}
            >
              Download CSV
            </Button>
            <Button
              variant="outline"
              iconName="FileJson"
              loading={downloading === 'json'}
              onClick={() => downloadReport('json')}
            >
              Download JSON
            </Button>
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Loading violation report...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
        )}

        {!loading && !error && report && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard label="Total Violations" value={report.total_violations ?? 0} icon="AlertTriangle" />
              <StatCard label="Minor" value={report?.violations_by_severity?.minor ?? 0} icon="Info" />
              <StatCard label="Major / Severe" value={`${report?.violations_by_severity?.major ?? 0} / ${report?.violations_by_severity?.severe ?? 0}`} icon="ShieldAlert" />
            </div>

            {!report?.rows?.length ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <div className="w-14 h-14 bg-muted rounded-full mx-auto mb-3 flex items-center justify-center">
                  <Icon name="ShieldCheck" size={24} className="text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">No Violations Recorded</h2>
                <p className="text-sm text-muted-foreground">
                  This completed exam has no violation events. You can still download the report.
                </p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-x-auto shadow-sm">
                <table className="w-full min-w-[950px]">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Violations</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Severity (M/Maj/S)</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Flagged</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Review Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Review Note</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => {
                      const isExpanded = Boolean(expandedStudents[row.student_id]);
                      const badgeInfo = REVIEW_BADGES[row.review_status] || REVIEW_BADGES.NONE;
                      const hasViolations = Boolean(row.violations && row.violations.length > 0);

                      return (
                        <React.Fragment key={row.student_id}>
                          <tr className="border-b border-border/60 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{row.student_id}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{row.violation_count}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {row.minor_count} / {row.major_count} / {row.severe_count}
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{row.flagged ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap ${badgeInfo.bg}`}>
                                {badgeInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={row.review_note || ''}>
                              {row.review_note || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {hasViolations ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(row.student_id)}
                                  className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                                >
                                  {isExpanded ? 'Hide Details' : `Review (${row.violations.length})`}
                                  <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded violation review list */}
                          {isExpanded && hasViolations && (
                            <tr className="bg-muted/30 border-b border-border/80">
                              <td colSpan={7} className="p-4">
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                    Student Violations ({row.violations.length})
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {row.violations.map((v) => {
                                      const vBadge = REVIEW_BADGES[v.review_status] || REVIEW_BADGES.NONE;
                                      const noteVal = violationNotes[v.id] !== undefined ? violationNotes[v.id] : (v.review_note || '');
                                      const isSaving = savingViolationId === v.id;

                                      return (
                                        <div key={v.id} className="p-3 bg-card border border-border rounded-lg shadow-xs space-y-2.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <div>
                                              <span className="text-xs font-semibold text-foreground">{v.type}</span>
                                              <span className="text-[10px] text-muted-foreground ml-2">
                                                {formatDate(v.timestamp)}
                                              </span>
                                            </div>
                                            <span className={`px-2 py-0.5 text-[10px] font-semibold border rounded-md ${vBadge.bg}`}>
                                              {vBadge.label}
                                            </span>
                                          </div>

                                          <input
                                            type="text"
                                            maxLength={300}
                                            placeholder="Review note (max 300 chars)..."
                                            value={noteVal}
                                            onChange={(e) =>
                                              setViolationNotes((prev) => ({
                                                ...prev,
                                                [v.id]: e.target.value.slice(0, 300),
                                              }))
                                            }
                                            disabled={isSaving}
                                            className="w-full px-2.5 py-1 text-xs rounded bg-muted border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                                          />

                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              disabled={isSaving}
                                              onClick={() => handleViolationReview(row.student_id, v.id, 'CONFIRMED')}
                                              className={`flex-1 py-1 px-2 rounded text-xs font-medium border transition-colors ${
                                                v.review_status === 'CONFIRMED'
                                                  ? 'bg-destructive text-white border-destructive'
                                                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                                              }`}
                                            >
                                              Confirm
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isSaving}
                                              onClick={() => handleViolationReview(row.student_id, v.id, 'FALSE_POSITIVE')}
                                              className={`flex-1 py-1 px-2 rounded text-xs font-medium border transition-colors ${
                                                v.review_status === 'FALSE_POSITIVE'
                                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                                              }`}
                                            >
                                              False alarm
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isSaving}
                                              onClick={() => handleViolationReview(row.student_id, v.id, 'UNSURE')}
                                              className={`flex-1 py-1 px-2 rounded text-xs font-medium border transition-colors ${
                                                v.review_status === 'UNSURE'
                                                  ? 'bg-amber-600 text-white border-amber-600'
                                                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                                              }`}
                                            >
                                              Unsure
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      </main>
      <AppFooter />
    </div>
  );
};

const StatCard = ({ label, value, icon }) => (
  <div className="bg-card border border-border rounded-lg p-4">
    <div className="flex items-center gap-2 mb-1">
      <Icon name={icon} size={16} className="text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <div className="text-lg md:text-xl font-semibold text-foreground">{value}</div>
  </div>
);

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default TeacherViolationReportPage;
