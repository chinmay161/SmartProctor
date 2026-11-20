import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import { apiRequest as httpApiRequest } from '../../services/httpClient';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import { formatViolationType, getViolationIcon } from '../../utils/violationSeverity';

const RAW_API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

const normalizeEvidencePaths = (rawValue) => {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.filter(Boolean).map(String);
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map(String);
      }
    } catch {
      // fall through
    }
    return [rawValue];
  }

  return [String(rawValue)];
};

const resolveEvidenceUrl = (path, base) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
};

const EVIDENCE_STATUS_LABELS = {
  no_image_in_request: 'No image captured',
  invalid_image: 'Invalid image format',
  too_large: 'Image exceeded size limit',
  storage_not_configured: 'Storage not configured',
  upload_failed: 'Upload failed',
  url_failed: 'Link generation failed',
  captured: 'Evidence captured',
};

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
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [failedImages, setFailedImages] = useState({});

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
    <main className="pt-20 pb-8">
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
                                      const evidencePaths = normalizeEvidencePaths(v.evidence_files || v.evidence_file);
                                      const primaryEvidence = evidencePaths[0] || null;
                                      const imageSrc = resolveEvidenceUrl(primaryEvidence, API_BASE);
                                      const isImageFailed = Boolean(failedImages[v.id]);

                                      return (
                                        <div key={v.id} className="p-3 bg-card border border-border rounded-lg shadow-xs space-y-2.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 truncate">
                                              <Icon name={getViolationIcon(v.type)} size={14} className="text-muted-foreground shrink-0" />
                                              <span className="text-xs font-semibold text-foreground truncate">{formatViolationType(v.type)}</span>
                                              <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                                                {formatDate(v.timestamp)}
                                              </span>
                                            </div>
                                            <span className={`px-2 py-0.5 text-[10px] font-semibold border rounded-md shrink-0 ${vBadge.bg}`}>
                                              {vBadge.label}
                                            </span>
                                          </div>

                                          {/* Evidence Snapshot Container */}
                                          <div className="relative rounded overflow-hidden bg-black/90 border border-border h-36 flex items-center justify-center group">
                                            {imageSrc && !isImageFailed ? (
                                              <>
                                                <img
                                                  src={imageSrc}
                                                  alt={`Evidence for ${v.type}`}
                                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer opacity-90 group-hover:opacity-100"
                                                  onClick={() => setSelectedEvidence({
                                                    url: imageSrc,
                                                    type: v.type,
                                                    student: row.student_id,
                                                    timestamp: v.timestamp,
                                                    severity: v.severity,
                                                    allPaths: evidencePaths.map(p => resolveEvidenceUrl(p, API_BASE)),
                                                  })}
                                                  onError={() => setFailedImages(prev => ({ ...prev, [v.id]: true }))}
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer pointer-events-none">
                                                  <span className="text-white text-xs font-semibold flex items-center gap-1 bg-black/60 px-2.5 py-1 rounded-md">
                                                    <Icon name="Maximize2" size={13} /> View Snapshot
                                                  </span>
                                                </div>
                                                <div className="absolute top-2 right-2 flex gap-1 z-10 pointer-events-none">
                                                  {v.severity && (
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded shadow-sm ${v.severity === 'severe' ? 'bg-destructive/90 text-white' : v.severity === 'major' ? 'bg-warning/90 text-white' : 'bg-primary/90 text-white'}`}>
                                                      {v.severity}
                                                    </span>
                                                  )}
                                                  {evidencePaths.length > 1 && (
                                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-black/70 text-white">
                                                      +{evidencePaths.length - 1}
                                                    </span>
                                                  )}
                                                </div>
                                              </>
                                            ) : (
                                              <div className="flex flex-col items-center justify-center text-xs text-muted-foreground p-3 text-center gap-1">
                                                <Icon name="CameraOff" size={22} className="opacity-50" />
                                                <span className="font-medium text-[11px]">
                                                  {isImageFailed ? 'Snapshot unavailable' : (EVIDENCE_STATUS_LABELS[v.evidence_status] || 'No snapshot captured')}
                                                </span>
                                                {v.severity && (
                                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground/70">
                                                    Severity: {v.severity}
                                                  </span>
                                                )}
                                              </div>
                                            )}
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

      {/* Lightbox Modal for Full-Resolution Evidence Preview */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <Icon name="Camera" className="text-primary" size={18} />
                <span className="font-semibold text-sm">
                  Evidence: {formatViolationType(selectedEvidence.type)}
                </span>
                {selectedEvidence.severity && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                    selectedEvidence.severity === 'severe' ? 'bg-destructive/20 text-destructive' :
                    selectedEvidence.severity === 'major' ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'
                  }`}>
                    {selectedEvidence.severity}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedEvidence(null)}>
                <Icon name="X" size={18} />
              </Button>
            </div>
            <div className="flex-1 bg-black flex items-center justify-center overflow-auto p-2 min-h-[350px]">
              <img
                src={selectedEvidence.url}
                alt={selectedEvidence.type}
                className="max-h-[72vh] max-w-full object-contain rounded"
              />
            </div>
            <div className="p-3 border-t border-border bg-card flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>Student: <strong className="text-foreground">{selectedEvidence.student}</strong></span>
                {selectedEvidence.timestamp && (
                  <span>Time: {formatDate(selectedEvidence.timestamp)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedEvidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Icon name="ExternalLink" size={14} /> Open Full Resolution
                </a>
                <Button size="xs" variant="outline" onClick={() => setSelectedEvidence(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
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
