import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import { authAwareCall } from '../../services/authAwareCall';

const getBackendOrigin = () => {
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/$/, '');
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  return window.location.origin.replace(/\/$/, '');
};

const TeacherMonitoringPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const backendOrigin = getBackendOrigin();

  const [sessions, setSessions] = useState([]);
  const [studentStates, setStudentStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);
  
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceList, setEvidenceList] = useState([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [timelineData, setTimelineData] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  
  const wsRefs = useRef({});
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  // Force re-render periodically to update "active/inactive" tags based on lastSeen time
  const [, setTick] = useState(0);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    mountedRef.current = true;
    intervalRef.current = setInterval(() => {
      setTick(t => t + 1);
    }, 2000);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, []);

  const fetchSessions = async () => {
    try {
      const data = await authAwareCall({
        path: `/proctoring/${examId}/sessions`,
        method: 'GET',
        auth0Authenticated: isAuthenticated,
        getAccessTokenSilently,
        auth0Audience
      });
      if (mountedRef.current) {
        setSessions(data || []);
        setStudentStates(prev => {
          const next = { ...prev };
          (data || []).forEach(s => {
              if (!next[s.id]) {
                  next[s.id] = { violations: s.violation_count || 0, lastViolation: 'None', lastSeen: Date.now(), trustScore: s.integrity_score ?? s.trust_score ?? 100 };
              } else {
                  next[s.id].trustScore = s.integrity_score ?? s.trust_score ?? next[s.id].trustScore;
              }
          });
          return next;
        });
      }
    } catch (err) {
      if (mountedRef.current) {
        setError('Failed to load active exam sessions.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const loadingFallback = window.setTimeout(() => {
      if (mountedRef.current) {
        setLoading(false);
      }
    }, 8000);

    fetchSessions().finally(() => {
      window.clearTimeout(loadingFallback);
    });

    return () => window.clearTimeout(loadingFallback);
  }, [examId, isAuthenticated, authLoading]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    const connectSockets = async () => {
      let token = null;
      try {
        token = await getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience }
        });
      } catch (e) {
        console.warn('Could not retrieve audience token for websockets', e);
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsHost = window.location.host;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        wsHost = 'localhost:8000';
      } else if (import.meta.env.VITE_API_URL) {
        try {
          const url = new URL(import.meta.env.VITE_API_URL);
          wsHost = url.host;
        } catch (e) {}
      }

      if (!wsRefs.current['exam']) {
        if (!token) {
          if (mountedRef.current) {
            setLoading(false);
          }
          showToast('Unable to authenticate live monitoring socket', 'error');
          return;
        }
        const wsUrl = `${wsProtocol}//${wsHost}/ws/proctor/exam/${examId}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUrl);
        wsRefs.current['exam'] = ws;

        ws.onopen = () => {
          console.log(`Connected to proctor WS for exam: ${examId}`);
          if (mountedRef.current) {
            setLoading(false);
          }
        };

        const processedEvents = new Map();
        const lastTimestamps = new Map();
        
        // LRU / TTL cleanup
        const cleanupInterval = setInterval(() => {
           const now = Date.now();
           for (const [eventId, timestamp] of processedEvents.entries()) {
               if (now - timestamp > 60000) { // 1 min TTL
                   processedEvents.delete(eventId);
               }
           }
        }, 30000);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'STATUS_SYNC') {
                if (data.timestamp) {
                    const lastStatusTs = lastTimestamps.get('status_sync') || 0;
                    if (data.timestamp < lastStatusTs) return;
                    lastTimestamps.set('status_sync', data.timestamp);
                }
                const statuses = data.statuses;
                setStudentStates(prev => {
                    const next = { ...prev };
                    for (const [sid, status] of Object.entries(statuses)) {
                        if (!next[sid]) next[sid] = { violations: 0, lastViolation: 'None', lastSeen: Date.now() };
                        next[sid].serverStatus = status;
                    }
                    return next;
                });
                return;
            }

            const sid = data.session_id;
            if (!sid) return;

            if (data.timestamp) {
                const lastTs = lastTimestamps.get(sid) || 0;
                if (data.timestamp < lastTs) return;
                lastTimestamps.set(sid, data.timestamp);
            }

            // Idempotency check for violations
            if (data.event_id) {
               if (processedEvents.has(data.event_id)) return;
               processedEvents.set(data.event_id, Date.now());
            }

            if (data.type === 'VIOLATION') {
              setStudentStates(prev => ({
                ...prev,
                [sid]: {
                  ...(prev[sid] || { lastSeen: Date.now() }),
                  violations: (prev[sid]?.violations || 0) + 1,
                  lastViolation: data.violation_type || 'Unknown Violation',
                  trustScore: data.integrity_score ?? data.trust_score ?? (prev[sid]?.trustScore ?? 100),
                  lastSeen: Date.now()
                }
              }));
              showToast(`New violation from ${data.student_id || sid}`, 'warning');
            }
          } catch (err) {
            console.error('WS MSG Parse Error', err);
          }
        };

        ws.onclose = () => {
          clearInterval(cleanupInterval);
          if (wsRefs.current['exam'] === ws) {
            delete wsRefs.current['exam'];
          }
        };

        ws.onerror = (event) => {
          console.error('Proctor websocket error', event);
        };

      }
    };

    connectSockets();

    return () => {};
  }, [examId, isAuthenticated, authLoading, getAccessTokenSilently, auth0Audience]);


  // Clean all sockets exactly once on unmount
  useEffect(() => {
    return () => {
      Object.keys(wsRefs.current).forEach(sid => {
        if (wsRefs.current[sid]) {
          wsRefs.current[sid].close();
        }
      });
    };
  }, []);

  const handleWarn = (sessionId) => {
    const ws = wsRefs.current['exam'];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'WARN_STUDENT', session_id: sessionId, message: 'Stay focused immediately! Proctor warning issued.' }));
      showToast('Warning sent successfully', 'success');
    } else {
      showToast('System is disconnected', 'error');
    }
  };

  const handleEndExam = (sessionId) => {
    const confirmed = window.confirm("Are you sure you want to end this student's exam permanently?");
    if (!confirmed) return;

    const ws = wsRefs.current['exam'];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'END_EXAM', session_id: sessionId }));
      showToast('Exam termination command sent', 'success');
    } else {
      showToast('System is disconnected', 'error');
    }
  };

  const handleForceSubmit = (sessionId) => {
    const ws = wsRefs.current['exam'];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'FORCE_SUBMIT', session_id: sessionId }));
      showToast('Force submit command sent', 'success');
    }
  };

  const handlePause = (sessionId) => {
    const ws = wsRefs.current['exam'];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PAUSE_EXAM', session_id: sessionId }));
      showToast('Pause exam command sent', 'warning');
    }
  };

  const openEvidence = async (sessionId) => {
    setEvidenceModalOpen(true);
    setLoadingEvidence(true);
    setEvidenceList([]);
    try {
      const data = await authAwareCall({
        path: `/violations/session/${sessionId}`,
        method: 'GET',
        auth0Authenticated: isAuthenticated,
        getAccessTokenSilently,
        auth0Audience
      });
      setEvidenceList(data || []);
    } catch(err) {
      showToast('Failed to load evidence', 'error');
    } finally {
      setLoadingEvidence(false);
    }
  };

  const openTimeline = async (sessionId) => {
    setTimelineModalOpen(true);
    setLoadingTimeline(true);
    setTimelineData([]);
    try {
      const data = await authAwareCall({
        path: `/sessions/${sessionId}/timeline`,
        method: 'GET',
        auth0Authenticated: isAuthenticated,
        getAccessTokenSilently,
        auth0Audience
      });
      setTimelineData(data || []);
    } catch(err) {
      showToast('Failed to load timeline', 'error');
    } finally {
      setLoadingTimeline(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <div className="animate-spin text-primary">
          <Icon name="Loader2" size={48} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center p-6">
        <Icon name="AlertCircle" size={64} className="text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Error Loading Dashboard</h2>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => navigate('/teacher-dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10 relative">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground mb-2 flex items-center">
              <Icon name="Monitor" className="mr-3 text-primary" size={28} />
              Live Exam Monitoring
            </h1>
            <p className="text-muted-foreground">Monitoring active sessions for Exam ID: {examId}</p>
          </div>
          <div className="mt-4 md:mt-0">
            <Button variant="outline" iconName="ArrowLeft" onClick={() => navigate('/teacher-dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-card glassmorphism border border-border p-10 rounded-xl text-center shadow-sm">
            <Icon name="UsersX" className="mx-auto text-muted-foreground mb-4" size={48} />
            <h3 className="text-xl font-medium text-foreground mb-2">No Active Students</h3>
            <p className="text-muted-foreground text-sm">There are currently no students taking this exam.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sessions.map(session => {
              const state = studentStates[session.id] || { violations: 0, lastViolation: 'None', lastSeen: 0 };
              
              // Backend strictly determines this now to prevent false offline states
              let isActive = state.serverStatus === 'live';
              if (!state.serverStatus) {
                  // Fallback if backend sweeper hasn't fired yet
                  const HEARTBEAT_INTERVAL = 5000;
                  isActive = (Date.now() - state.lastSeen) < (3 * HEARTBEAT_INTERVAL);
              }

              return (


                <div key={session.id} className="bg-card glassmorphism border border-border rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-xl group">
                  {/* Top Status Bar */}
                  <div className={`absolute top-0 left-0 w-full h-1 ${isActive ? 'bg-success' : 'bg-muted-foreground'}`} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground text-lg truncate pr-2" title={session.student_id}>
                        {session.student_id}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono mt-1">ID: {session.id.substring(0, 8)}...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`px-2 py-0.5 rounded-full text-xs font-bold ${state.trustScore > 80 ? 'bg-success/20 text-success' : state.trustScore > 50 ? 'bg-warning/20 text-warning' : 'bg-destructive/20 text-destructive'}`}>
                        Score: {state.trustScore ?? 100}
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isActive ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'}`}>
                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`}></span>
                        {isActive ? 'Live' : 'Offline'}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 my-2">
                    <div className="bg-muted/40 rounded-lg p-3 border border-border/50">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Violations</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${state.violations > 0 ? 'bg-destructive/20 text-destructive' : 'bg-success/10 text-success'}`}>
                          {state.violations}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-3">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Latest</span>
                        <span className="text-xs text-foreground truncate pl-2 font-mono">
                          {state.lastViolation}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      iconName="Activity"
                      onClick={() => openTimeline(session.id)}
                      className="w-full text-xs shadow-sm border-dashed flex-1 px-1"
                    >
                      Timeline
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      iconName="Camera"
                      onClick={() => openEvidence(session.id)}
                      className="w-full text-xs shadow-sm border-dashed flex-1 px-1"
                    >
                      Evidence
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <Button 
                      variant="warning" 
                      size="sm" 
                      onClick={() => handleWarn(session.id)}
                      className="w-full text-xs"
                      disabled={!isActive}
                    >
                      Warn
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handlePause(session.id)}
                      className="w-full text-xs"
                      disabled={!isActive}
                    >
                      Pause
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => handleForceSubmit(session.id)}
                      className="w-full text-xs col-span-2 mt-1"
                      disabled={!isActive}
                    >
                      Force Submit
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`pointer-events-auto px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-right-8 fade-in 
              ${toast.type === 'error' ? 'bg-destructive text-destructive-foreground' : 
                toast.type === 'warning' ? 'bg-warning text-warning-foreground' : 
                'bg-success text-success-foreground'}`}
          >
            <Icon 
              name={toast.type === 'error' ? 'XCircle' : toast.type === 'warning' ? 'AlertTriangle' : 'CheckCircle'} 
              size={20} 
            />
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        ))}
      </div>

      {evidenceModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon name="Camera" className="text-primary" /> Warning Evidence
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setEvidenceModalOpen(false)}>
                <Icon name="X" size={20} />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-muted/10">
              {loadingEvidence ? (
                <div className="flex justify-center py-10">
                   <Icon name="Loader2" className="animate-spin text-primary" size={32} />
                </div>
              ) : evidenceList.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                   <Icon name="CheckCircle" className="mx-auto mb-2 text-success/60" size={48} />
                   <p>No violations recorded for this session.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {evidenceList.map(ev => {
                    let images = [];
                    if (ev.evidence_files) {
                      try {
                        images = JSON.parse(ev.evidence_files);
                        if (!Array.isArray(images)) images = [ev.evidence_files];
                      } catch {
                        images = [ev.evidence_files];
                      }
                    } else if (ev.evidence_file) {
                      images = [ev.evidence_file];
                    }

                    return (
                    <div key={ev.id} className="bg-card border border-border rounded-lg overflow-hidden shadow-sm flex flex-col md:flex-row">
                      {images.length > 0 ? (
                        <div className="w-full md:w-1/3 bg-black flex gap-1 overflow-x-auto items-center p-1">
                          {images.map((img, i) => (
                            <img 
                              key={i}
                              src={`${backendOrigin}${img}`}
                              alt="Violation Evidence" 
                              className="w-full h-32 md:min-w-[150px] object-cover flex-shrink-0"
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="w-full md:w-1/3 bg-muted flex items-center justify-center h-32 text-xs text-muted-foreground text-center px-4">
                          No snapshot<br/>captured
                        </div>
                      )}
                      <div className="p-4 flex-1">
                        <div className="flex justify-between items-start mb-2">
                           <h4 className="font-semibold capitalize">{ev.type || 'Unknown Violation'}</h4>
                           <span className={`px-2 py-0.5 text-xs font-bold rounded ${ev.severity === 'severe' ? 'bg-destructive/20 text-destructive' : ev.severity === 'major' ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'}`}>
                             {ev.severity}
                           </span>
                        </div>
                        
                        {ev.reason && <p className="text-sm text-foreground/90 font-medium mb-1">{ev.reason}</p>}
                        {ev.duration_ms && <p className="text-xs text-muted-foreground mb-2">Duration: {(ev.duration_ms / 1000).toFixed(1)}s</p>}
                        
                        <p className="text-xs text-muted-foreground mt-2">{ev.timestamp ? new Date(ev.timestamp).toLocaleString() : 'No date'}</p>
                        
                        {/* Dispute Resolution Section */}
                        {ev.dispute_status && ev.dispute_status !== 'NONE' && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Dispute Status</h5>
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-bold ${
                                ev.dispute_status === 'PENDING' ? 'text-warning' : 
                                ev.dispute_status === 'ACCEPTED' ? 'text-success' : 'text-destructive'
                              }`}>
                                {ev.dispute_status}
                              </span>
                              
                              {ev.dispute_status === 'PENDING' && (
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-xs px-2"
                                    onClick={async () => {
                                      try {
                                        await authAwareCall({
                                          path: `/violations/${ev.id}/resolve-dispute`,
                                          method: 'POST',
                                          body: { status: 'REJECTED' },
                                          auth0Authenticated: isAuthenticated,
                                          getAccessTokenSilently,
                                          auth0Audience
                                        });
                                        // Simple local state update
                                        setEvidenceList(prev => prev.map(p => p.id === ev.id ? { ...p, dispute_status: 'REJECTED' } : p));
                                        showToast('Dispute rejected');
                                      } catch(err) {
                                        showToast('Failed to reject dispute', 'error');
                                      }
                                    }}
                                  >
                                    Reject
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    className="h-7 text-xs px-2"
                                    onClick={async () => {
                                      try {
                                        await authAwareCall({
                                          path: `/violations/${ev.id}/resolve-dispute`,
                                          method: 'POST',
                                          body: { status: 'ACCEPTED' },
                                          auth0Authenticated: isAuthenticated,
                                          getAccessTokenSilently,
                                          auth0Audience
                                        });
                                        setEvidenceList(prev => prev.map(p => p.id === ev.id ? { ...p, dispute_status: 'ACCEPTED' } : p));
                                        showToast('Dispute accepted. Score adjusted.', 'success');
                                      } catch(err) {
                                        showToast('Failed to accept dispute', 'error');
                                      }
                                    }}
                                  >
                                    Accept
                                  </Button>
                                </div>
                              )}
                            </div>
                            {ev.dispute_reason && <p className="text-xs text-muted-foreground mt-1 bg-muted/40 p-2 rounded">"{ev.dispute_reason}"</p>}
                          </div>
                        )}
                        
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {timelineModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon name="Activity" className="text-primary" /> Session Timeline
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setTimelineModalOpen(false)}>
                <Icon name="X" size={20} />
              </Button>
            </div>
            <div className="p-4 py-6 overflow-y-auto flex-1 bg-muted/10 relative">
              {loadingTimeline ? (
                <div className="flex justify-center py-10">
                   <Icon name="Loader2" className="animate-spin text-primary" size={32} />
                </div>
              ) : timelineData.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                   <p>No timeline events recorded.</p>
                </div>
              ) : (
                <div className="relative pl-6">
                  <div className="absolute top-0 bottom-0 left-[11px] w-0.5 bg-border/50"></div>
                  <div className="space-y-6">
                    {timelineData.map((evt, idx) => {
                      const isViolation = evt.event === 'VIOLATION_RECORD';
                      const isScoreDrop = evt.event === 'INTEGRITY_SCORE_CHANGE';
                      const timeStr = new Date(evt.timestamp).toLocaleTimeString();
                      
                      return (
                        <div key={idx} className="relative">
                          <div className={`absolute -left-6 w-3 h-3 rounded-full mt-1.5 border-2 border-background ${isViolation ? 'bg-destructive' : isScoreDrop ? 'bg-warning' : 'bg-primary'}`}></div>
                          <div className="bg-card border border-border/60 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-sm font-semibold capitalize ${isViolation ? 'text-destructive' : isScoreDrop ? 'text-warning' : 'text-foreground'}`}>
                                {isViolation ? `Violation: ${evt.data.type || 'Unknown'}` : evt.event.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">{timeStr}</span>
                            </div>
                            
                            {isViolation && (
                              <div className="mt-2 text-sm text-foreground/80 space-y-1">
                                {evt.data.reason && <p><span className="font-semibold text-muted-foreground text-xs">Reason:</span> {evt.data.reason}</p>}
                                <div className="flex gap-4 mt-1">
                                  {evt.data.severity && <span><span className="font-semibold text-muted-foreground text-xs">Severity:</span> <span className={`capitalize ${evt.data.severity === 'severe' ? 'text-destructive' : 'text-warning'}`}>{evt.data.severity}</span></span>}
                                  {evt.data.duration_ms && <span><span className="font-semibold text-muted-foreground text-xs">Duration:</span> {(evt.data.duration_ms / 1000).toFixed(1)}s</span>}
                                </div>
                                {evt.data.evidence && Array.isArray(evt.data.evidence) && evt.data.evidence.length > 0 && (
                                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                    {evt.data.evidence.map((img, i) => (
                                      <img key={i} src={`${backendOrigin}${img}`} alt="Evidence" className="h-16 w-16 object-cover rounded border border-border" />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {isScoreDrop && (
                              <p className="text-sm text-foreground/80 mt-1">
                                Score reduced by <span className="font-bold text-destructive">{evt.data.deduction}</span>. New Score: {evt.data.new_score}
                              </p>
                            )}

                            {!isViolation && !isScoreDrop && (
                              <p className="text-xs font-mono text-muted-foreground mt-2 bg-muted p-2 rounded max-h-24 overflow-y-auto">
                                {JSON.stringify(evt.data)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherMonitoringPage;
