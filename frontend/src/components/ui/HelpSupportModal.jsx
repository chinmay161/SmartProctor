import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';
import DeviceTestModal from '../proctoring/DeviceTestModal';

const HelpSupportModal = ({ isOpen, onClose }) => {
  const [showDeviceTest, setShowDeviceTest] = useState(false);
  const [faqOpen, setFaqOpen] = useState({ 0: true });
  const [supportCategory, setSupportCategory] = useState('technical');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !showDeviceTest) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, showDeviceTest]);

  if (!isOpen) return null;

  const toggleFaq = (idx) => {
    setFaqOpen((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSubmitTicket = (e) => {
    e.preventDefault();
    const ticketId = `SP-${Math.floor(10000 + Math.random() * 90000)}`;
    setSubmittedTicket({
      id: ticketId,
      category: supportCategory,
      subject: supportSubject,
      message: supportMessage,
      createdAt: new Date().toISOString(),
    });
    setSupportSubject('');
    setSupportMessage('');
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="fixed inset-0"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-card shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Icon name="HelpCircle" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Help & Support</h2>
                <p className="text-xs text-muted-foreground">Device diagnostics, proctoring guides, and technical assistance</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="X" size={18} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Diagnostic Quick Action Card */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-1.5 text-primary font-semibold text-xs mb-0.5">
                  <Icon name="Camera" size={15} />
                  <span>Diagnostic Tool</span>
                </div>
                <p className="text-xs text-foreground font-medium">Camera & Microphone Device Check</p>
                <p className="text-[11px] text-muted-foreground">Test SolvePnP face tracking, mic audio, and browser permissions</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeviceTest(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm shrink-0 flex items-center justify-center space-x-1.5"
              >
                <Icon name="Play" size={13} />
                <span>Run Diagnostic</span>
              </button>
            </div>

            {/* FAQ Accordions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground mb-1">Frequently Asked Questions</p>
              {[
                {
                  q: 'How does client-side proctoring protect student privacy?',
                  a: 'SmartProctor computes face orientation, head pose (Pitch/Yaw/Roll), and eye gaze directly on the client machine using MediaPipe FaceMesh & OpenCV SolvePnP. No continuous video or audio recordings are saved or uploaded to cloud storage.',
                },
                {
                  q: 'What happens if a student experiences internet dropouts?',
                  a: 'The assessment engine locally caches all student responses, question timestamps, and telemetry. When connectivity restores, results automatically synchronize without data loss.',
                },
                {
                  q: 'How do I release exam results and download violation logs?',
                  a: 'From your Teacher Dashboard, click the "Completed" tab. Use "Analytics" to view score distribution or "Violation Report" to export time-stamped incident logs.',
                },
              ].map((item, idx) => (
                <div key={idx} className="border border-border rounded-lg overflow-hidden bg-card">
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-foreground flex items-center justify-between hover:bg-muted/50 transition"
                  >
                    <span>{item.q}</span>
                    <Icon name={faqOpen[idx] ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground shrink-0 ml-2" />
                  </button>
                  {faqOpen[idx] && (
                    <div className="px-4 pb-3 pt-1 text-xs text-muted-foreground border-t border-border/50 bg-muted/20 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Support Ticket Submission */}
            <form onSubmit={handleSubmitTicket} className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
              <p className="text-xs font-semibold text-foreground">Submit a Support Ticket</p>

              {submittedTicket && (
                <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-foreground space-y-1 animate-in fade-in">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Icon name="CheckCircle" size={15} />
                    Ticket {submittedTicket.id} Created
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Your request regarding "{submittedTicket.subject}" has been logged. Our academic support engineers typically respond within 15 minutes.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Issue Category</label>
                  <select
                    value={supportCategory}
                    onChange={(e) => setSupportCategory(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="technical">Camera / Device Permissions</option>
                    <option value="exam_config">Exam Publishing & Settings</option>
                    <option value="grading">Results & Violation Reports</option>
                    <option value="other">General Account Inquiry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Subject</label>
                  <input
                    type="text"
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="Brief summary of your question"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Details</label>
                <textarea
                  rows={3}
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="Describe the issue or assistance required..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  required
                />
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-muted-foreground">Urgent: support@smartproctor.io</span>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-sm transition"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Device Test Modal */}
      {showDeviceTest && (
        <DeviceTestModal onClose={() => setShowDeviceTest(false)} />
      )}
    </>
  );
};

export default HelpSupportModal;
