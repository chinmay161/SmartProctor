import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import EvidenceGallery from './components/EvidenceGallery';

const TeacherExamAnalyticsPage = () => {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  
  const [evidenceData, setEvidenceData] = useState([]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [downloading, setDownloading] = useState(null);

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
    document.title = 'Exam Intelligence Analytics - SmartProctor';
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadAnalytics = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await callApi({
          path: `/exam-analytics/${encodeURIComponent(examId)}`,
          method: 'GET',
        });
        if (mounted) {
          setAnalytics(data || null);
        }
      } catch (err) {
        if (mounted) setError(err?.detail || err?.message || 'Failed to load analytics');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (examId) loadAnalytics();
    return () => {
      mounted = false;
    };
  }, [examId, auth0Authenticated]);

  const handleDownload = async (type) => {
    setDownloading(type);
    try {
      const token = await getAccessTokenSilently();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/exam-analytics/${examId}/export/${type}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam_${examId}_report.${type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch(err) {
      setError(`Failed to export ${type.toUpperCase()} report.`);
    } finally {
      setDownloading(null);
    }
  };

  const loadEvidence = async () => {
      try {
          const data = await callApi({
              path: `/exam-analytics/${encodeURIComponent(examId)}/evidence`,
              method: 'GET'
          });
          setEvidenceData(data || []);
          setShowEvidence(true);
      } catch(err) {
          setError('Failed to load evidence gallery.');
      }
  };

  // Prepare chart data
  const riskColors = {
      'SAFE': '#10b981',
      'SUSPICIOUS': '#f59e0b',
      'HIGH_RISK': '#ef4444'
  };
  
  const riskData = analytics ? Object.entries(analytics.risk_distribution).map(([name, value]) => ({ name, value })) : [];
  const violationData = analytics ? Object.entries(analytics.violation_analytics).map(([name, count]) => ({ name, count })) : [];

  return (
    <main className="pt-20 pb-12 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground flex items-center gap-2">
               <Icon name="Activity" className="text-primary" /> Exam Intelligence Report
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Deep analytics, risk distribution, and automated reporting.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" iconName="ArrowLeft" onClick={() => navigate('/teacher-dashboard')}>
              Back to Dashboard
            </Button>
            <Button variant="outline" iconName="Image" onClick={loadEvidence}>
              Evidence Gallery
            </Button>
            <Button variant="outline" iconName="FileSpreadsheet" onClick={() => handleDownload('csv')} disabled={downloading || loading}>
              {downloading === 'csv' ? 'Exporting...' : 'Export CSV'}
            </Button>
            <Button variant="default" iconName="FileText" onClick={() => handleDownload('pdf')} disabled={downloading || loading}>
              {downloading === 'pdf' ? 'Exporting...' : 'Download PDF'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground flex flex-col items-center">
             <Icon name="Loader2" className="animate-spin mb-2" size={32} />
             Loading advanced analytics...
          </div>
        ) : analytics ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Total Students" value={analytics.total_students} icon="Users" />
              <StatCard label="Completed" value={analytics.completed} icon="CheckCircle2" color="text-success" />
              <StatCard label="Auto-Submitted" value={analytics.auto_submitted} icon="AlertOctagon" color="text-error" />
              <StatCard label="Avg Quality Score" value={`${analytics.avg_score}%`} icon="Target" />
              <StatCard label="Avg Trust Score" value={analytics.avg_trust_score} icon="ShieldCheck" color={analytics.avg_trust_score > 80 ? 'text-success' : 'text-warning'} />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="md:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
                   <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><Icon name="BarChart2" size={18}/> Violation Breakdown</h3>
                   <div className="h-72 w-full">
                       {violationData.length > 0 ? (
                           <ResponsiveContainer width="100%" height="100%">
                               <BarChart data={violationData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                                   <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                   <XAxis dataKey="name" tick={{fontSize: 12}} angle={-15} textAnchor="end" />
                                   <YAxis />
                                   <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                   <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                               </BarChart>
                           </ResponsiveContainer>
                       ) : (
                           <div className="h-full flex items-center justify-center text-muted-foreground">No violations recorded</div>
                       )}
                   </div>
               </div>
               <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
                   <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><Icon name="PieChart" size={18}/> Risk Distribution</h3>
                   <div className="h-72 w-full flex-1">
                       <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                               <Pie
                                  data={riskData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  paddingAngle={5}
                                  dataKey="value"
                               >
                                  {riskData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={riskColors[entry.name]} />
                                  ))}
                               </Pie>
                               <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                               <Legend verticalAlign="bottom" height={36} />
                           </PieChart>
                       </ResponsiveContainer>
                   </div>
               </div>
            </div>

            {/* Students Table */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
               <div className="p-4 border-b border-border bg-muted/20">
                   <h2 className="text-lg font-semibold flex items-center gap-2"><Icon name="ListOrdered" /> Leaderboard & Student Intel</h2>
               </div>
               <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                       <thead className="bg-muted/40 text-muted-foreground uppercase text-xs">
                           <tr>
                               <th className="px-6 py-4 font-semibold">Student</th>
                               <th className="px-6 py-4 font-semibold">Base Score</th>
                               <th className="px-6 py-4 font-semibold">Trust Score</th>
                               <th className="px-6 py-4 font-semibold">Violations</th>
                               <th className="px-6 py-4 font-semibold">Risk Engine</th>
                               <th className="px-6 py-4 font-semibold text-right">Final Adjusted Score</th>
                               <th className="px-6 py-4 font-semibold text-right">Review</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                           {analytics.students.map((student, idx) => (
                               <tr key={student.session_id} className="hover:bg-muted/30 transition-colors">
                                   <td className="px-6 py-4 font-medium">
                                       <div className="flex items-center gap-2">
                                           <span className="w-6 text-muted-foreground text-xs">{idx + 1}.</span>
                                           {student.name}
                                       </div>
                                   </td>
                                   <td className="px-6 py-4">{student.score}</td>
                                   <td className="px-6 py-4"><span className={`font-semibold ${student.trust_score > 80 ? 'text-success' : student.trust_score >= 50 ? 'text-warning' : 'text-error'}`}>{student.trust_score}</span></td>
                                   <td className="px-6 py-4">{student.violations}</td>
                                   <td className="px-6 py-4">
                                       <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${student.risk_level === 'SAFE' ? 'bg-success/15 text-success' : student.risk_level === 'SUSPICIOUS' ? 'bg-warning/15 text-warning' : 'bg-error/15 text-error'}`}>
                                           {student.risk_level}
                                       </span>
                                   </td>
                                   <td className="px-6 py-4 text-right font-bold text-lg">
                                       {student.final_score}
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         disabled={!student.attempt_id}
                                         onClick={() => navigate(`/teacher-dashboard/completed/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(student.attempt_id)}/review`)}
                                       >
                                         Review
                                       </Button>
                                   </td>
                               </tr>
                           ))}
                           {analytics.students.length === 0 && (
                               <tr>
                                   <td colSpan="7" className="px-6 py-8 text-center text-muted-foreground">No student data available yet.</td>
                               </tr>
                           )}
                       </tbody>
                   </table>
               </div>
            </div>

          </div>
        ) : null}
      </div>

      {showEvidence && <EvidenceGallery evidenceData={evidenceData} onClose={() => setShowEvidence(false)} />}
    </main>
  );
};

const StatCard = ({ label, value, icon, color = 'text-foreground' }) => (
  <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className={`p-2 rounded-lg bg-muted ${color}`}>
         <Icon name={icon} size={18} />
      </div>
    </div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
  </div>
);

export default TeacherExamAnalyticsPage;
