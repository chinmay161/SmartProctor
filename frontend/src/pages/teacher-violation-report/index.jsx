import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import { apiRequest as httpApiRequest } from '../../services/httpClient';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';

const RAW_API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

const TeacherViolationReportPage = () => {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

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
              <div className="bg-card border border-border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Violations</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Minor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Major</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Severe</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Flagged</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">First</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.student_id} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-3 text-sm text-foreground">{row.student_id}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.violation_count}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.minor_count}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.major_count}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.severe_count}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.flagged ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{formatDate(row.first_violation_at)}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{formatDate(row.last_violation_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
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
