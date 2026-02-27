/**
 * Example Student Dashboard Component
 * Demonstrates:
 * - Using useSession hook
 * - Making authenticated API calls
 * - Handling loading and error states
 * - Displaying user-specific data
 * - Logout functionality
 * - Role-based rendering
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useSession, useCurrentUser } from '../../../context/SessionContext';
import { apiGet, apiPost } from '../../../services/httpClient';
import { sessionEvents } from '../../../services/tokenStorage';
import Button from '../../../components/ui/Button';

/**
 * Student Dashboard
 * Shows enrolled exams, exam status, upcoming deadlines
 */
const StudentDashboardExample = () => {
  const navigate = useNavigate();
  const { logout, getTokenTimeRemaining, sessionId } = useSession();
  const { user } = useCurrentUser();
  const { user: auth0User, isAuthenticated: auth0Authenticated, logout: auth0Logout } = useAuth0();
  
  // State for exams and loading
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tokenWarning, setTokenWarning] = useState(false);

  /**
   * Load student's enrolled exams on component mount
   */
  useEffect(() => {
    const loadExams = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // API call - token automatically included in Authorization header
        // If token expired, axios interceptor will automatically refresh it
        const response = await apiGet('/api/exams');
        
        // Assuming backend returns exams array
        setExams(response.exams || response);
      } catch (err) {
        // Handle errors gracefully
        const errorMsg = err?.response?.data?.detail || 
                        err?.message || 
                        'Failed to load exams';
        setError(errorMsg);
        
        // Log error for debugging (don't use sensitive details)
        console.error('Failed to load exams:', errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadExams();
  }, []);

  /**
   * Monitor session expiration
   */
  useEffect(() => {
    const checkTokenExpiration = () => {
      const timeRemaining = getTokenTimeRemaining();
      
      // Show warning if token expires in less than 5 minutes (300 seconds)
      if (timeRemaining && timeRemaining < 300 && timeRemaining > 0) {
        setTokenWarning(true);
      } else {
        setTokenWarning(false);
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkTokenExpiration, 30000);
    
    // Check immediately
    checkTokenExpiration();

    // Listen for session expiration
    const handleSessionExpired = () => {
      setError('Your session has expired. Please login again.');
      // ProtectedRoute will handle redirect to login
    };

    sessionEvents.on('sessionExpired', handleSessionExpired);

    return () => {
      clearInterval(interval);
      sessionEvents.off('sessionExpired', handleSessionExpired);
    };
  }, [getTokenTimeRemaining]);

  /**
   * Handle logout action
   */
  const handleLogout = async () => {
    try {
      // Call logout - clears tokens and broadcasts to other tabs
      await logout(false); // false = logout from this device only
      if (auth0Authenticated) {
        auth0Logout({
          logoutParams: {
            returnTo: `${window.location.origin}/login`,
          },
        });
        return;
      }
      
      // ProtectedRoute will automatically redirect to /login
      // But we can also manually navigate for better UX
      navigate('/login');
    } catch (err) {
      setError('Failed to logout. Please try again.');
    }
  };

  /**
   * Handle exam enrollment
   */
  const handleEnrollExam = async (examId) => {
    try {
      // Example API call with POST
      const response = await apiPost(`/api/exams/${examId}/enroll`, {});
      
      // Refresh exams list
      const updated = await apiGet('/api/exams');
      setExams(updated.exams || updated);
    } catch (err) {
      setError('Failed to enroll in exam');
    }
  };

  /**
   * Start exam
   */
  const handleStartExam = async (examId) => {
    try {
      // API call to create exam session
      const response = await apiPost(`/api/exams/${examId}/start`, {
        sessionId: sessionId,
        deviceInfo: navigator.userAgent
      });
      
      // Navigate to exam portal
      navigate(`/exam-portal/${examId}`, {
        state: { sessionId: response.session_id }
      });
    } catch (err) {
      setError('Failed to start exam');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading exams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Student Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {auth0User?.name || auth0User?.nickname || user?.name || 'Student'}!
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Session Info */}
            <div className="text-sm text-muted-foreground text-right">
              <p>Session: {sessionId?.slice(0, 8)}...</p>
              <p>Expires in: {Math.floor((getTokenTimeRemaining() || 0) / 60)} min</p>
            </div>
            
            {/* Logout Button */}
            <Button
              onClick={handleLogout}
              variant="outline"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Token Expiration Warning */}
        {tokenWarning && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                Session expiring soon
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-1">
                Your session will expire in {Math.floor((getTokenTimeRemaining() || 0) / 60)} minutes.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">
              Error: {error}
            </p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-red-700 dark:text-red-500 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* User Info Card */}
        <div className="mb-8 p-6 bg-card border border-border rounded-lg">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Your Account
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="text-foreground font-medium">{auth0User?.name || auth0User?.nickname || user?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-foreground font-medium">{auth0User?.email || user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="text-foreground font-medium">
                {user?.roles?.join(', ') || 'student'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="text-foreground font-medium text-xs font-mono">
                {(auth0User?.sub || user?.id || 'N/A')?.toString()?.slice(0, 12)}
              </p>
            </div>
          </div>
        </div>

        {/* Exams Section */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-6">
            Enrolled Exams ({exams.length})
          </h2>
          
          {exams.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <p className="text-muted-foreground">No exams enrolled yet</p>
              <Button className="mt-4" onClick={() => navigate('/exam-portal')}>
                Browse Available Exams
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {exams.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  onStart={() => handleStartExam(exam.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

/**
 * Individual Exam Card Component
 */
const ExamCard = ({ exam, onStart }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-400';
      case 'scheduled':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-400';
      case 'completed':
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-400';
      default:
        return 'bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const isStartable = exam.status === 'active' && !exam.attempted;

  return (
    <div className="p-6 bg-card border border-border rounded-lg hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">
            {exam.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {exam.description}
          </p>
        </div>
        
        {/* Status Badge */}
        <div className={`ml-4 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(exam.status)}`}>
          {exam.status?.charAt(0).toUpperCase() + exam.status?.slice(1) || 'Unknown'}
        </div>
      </div>

      {/* Exam Details */}
      <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="text-foreground font-medium">{exam.duration} min</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Questions</p>
          <p className="text-foreground font-medium">{exam.question_count}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Start Date</p>
          <p className="text-foreground font-medium">
            {new Date(exam.start_date).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">End Date</p>
          <p className="text-foreground font-medium">
            {new Date(exam.end_date).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex gap-2">
        {isStartable && (
          <Button
            onClick={onStart}
            className="flex-1"
          >
            Start Exam
          </Button>
        )}
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => window.location.href = `/exam-details/${exam.id}`}
        >
          View Details
        </Button>
      </div>

      {/* Info Messages */}
      {exam.attempted && (
        <p className="text-xs text-muted-foreground mt-3">
          Already attempted on {new Date(exam.attempt_date).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};

export default StudentDashboardExample;
