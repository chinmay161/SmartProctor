import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../services/authAwareCall';
import flightRecorder from '../../telemetry/flightRecorder';
import Icon from '../AppIcon';
import Button from '../ui/Button';

const CATEGORIES = [
  { value: 'camera', label: 'Camera / Webcam issue' },
  { value: 'microphone', label: 'Microphone / Audio issue' },
  { value: 'fullscreen', label: 'Fullscreen / Lockdown issue' },
  { value: 'screen_share', label: 'Screen sharing issue' },
  { value: 'questions', label: 'Questions / Content issue' },
  { value: 'login', label: 'Login / Session issue' },
  { value: 'other', label: 'Other issue' },
];

const ReportProblemModal = ({ examId = null, sessionId = null, onClose }) => {
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [category, setCategory] = useState('camera');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!text.trim()) {
      setError('Please provide a description of the issue.');
      return;
    }
    if (text.length > 500) {
      setError('Description must be 500 characters or fewer.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // 1. Flush telemetry events prior to sending the report
      try {
        await flightRecorder.flush();
      } catch {
        // Telemetry flush is best-effort
      }

      // 2. Derive user_hash-free metadata
      const cleanPath = (typeof window !== 'undefined' ? window.location.pathname : '/').split('?')[0].split('#')[0];
      const traceId = flightRecorder.getTraceId ? flightRecorder.getTraceId() : flightRecorder.traceId;
      const finalSessionId = sessionId || flightRecorder.sessionId || null;
      const finalExamId = examId || flightRecorder.examId || null;

      // 3. Post to backend
      await authAwareCall({
        path: '/feedback/problem',
        method: 'POST',
        body: {
          category,
          text: text.trim(),
          page_path: cleanPath,
          trace_id: traceId || null,
          session_id: finalSessionId,
          exam_id: finalExamId,
          app_version: '1.0.0',
        },
        auth0Authenticated,
        getAccessTokenSilently,
        auth0Audience,
      });

      setSuccess(true);
      setTimeout(() => {
        onClose?.();
      }, 1500);
    } catch (err) {
      if (err?.status === 429 || err?.status_code === 429 || (err?.detail && String(err.detail).includes('Rate limit'))) {
        setError('Rate limit reached (max 5 reports per 10 minutes). Please wait before submitting another report.');
      } else {
        setError(err?.detail || err?.message || 'Failed to submit problem report. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-problem-title"
      className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose?.();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 relative flex flex-col gap-4 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-warning/15 flex items-center justify-center text-warning">
              <Icon name="AlertCircle" size={20} />
            </div>
            <div>
              <h2 id="report-problem-title" className="text-base font-semibold text-foreground">
                Report a Problem
              </h2>
              <p className="text-xs text-muted-foreground">
                Let us know what issue you are experiencing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-success/20 text-success mx-auto flex items-center justify-center">
              <Icon name="Check" size={24} />
            </div>
            <p className="text-sm font-semibold text-foreground">Problem report sent</p>
            <p className="text-xs text-muted-foreground">Thank you for reporting this issue. Closing window...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="p-3 rounded-lg bg-error/10 border border-error/30 text-xs text-error">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="problem-category" className="block text-xs font-semibold text-foreground mb-1.5">
                Issue Category
              </label>
              <select
                id="problem-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
                className="w-full bg-muted border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="problem-text" className="block text-xs font-semibold text-foreground">
                  Description
                </label>
                <span className={`text-[11px] ${text.length > 500 ? 'text-error font-semibold' : 'text-muted-foreground'}`}>
                  {text.length}/500
                </span>
              </div>
              <textarea
                id="problem-text"
                rows={4}
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={submitting}
                placeholder="Briefly describe what happened (e.g. camera froze, question did not load)..."
                className="w-full bg-muted border border-border text-foreground placeholder:text-muted-foreground/60 text-sm rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                disabled={submitting || !text.trim() || text.length > 500}
                iconName="Send"
              >
                Submit Report
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ReportProblemModal;
