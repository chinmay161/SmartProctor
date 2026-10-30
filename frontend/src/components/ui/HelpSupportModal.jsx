import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';
import DeviceTestModal from '../proctoring/DeviceTestModal';

const HelpSupportModal = ({ isOpen, onClose }) => {
  const [showDeviceTest, setShowDeviceTest] = useState(false);
  const [faqOpen, setFaqOpen] = useState({ 0: true });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleFaq = (idx) => {
    setFaqOpen((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const faqs = [
    {
      q: 'How does client-side proctoring protect student privacy?',
      a: 'SmartProctor checks camera and microphone inputs on your device using MediaPipe face and audio models. Only still photos of flagged moments are kept; no continuous video or audio is recorded.',
    },
    {
      q: 'What happens if a student experiences internet dropouts?',
      a: 'Answers are saved as you go and retried when the connection comes back.',
    },
    {
      q: 'How do instructors review exam attempts?',
      a: 'Instructors can view score summaries and time-stamped activity timelines of flagged moments from their dashboard.',
    },
    {
      q: 'What permissions does the exam require?',
      a: 'Online exams require camera and microphone access to verify presence and detect speech, as well as fullscreen mode to minimize distractions during the test.',
    },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="bg-card border border-border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Icon name="HelpCircle" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Help & Information</h2>
                <p className="text-xs text-muted-foreground">Device diagnostics and proctoring guidelines</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition cursor-pointer"
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
                  <span>Device Readiness</span>
                </div>
                <p className="text-xs text-foreground font-medium">Camera & Microphone Device Check</p>
                <p className="text-[11px] text-muted-foreground">Check your webcam, microphone, and browser permissions before exam day</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeviceTest(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm shrink-0 flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Icon name="Play" size={13} />
                <span>Run Device Check</span>
              </button>
            </div>

            {/* FAQ Accordions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground mb-1">Frequently Asked Questions</p>
              {faqs.map((item, idx) => (
                <div key={idx} className="border border-border rounded-lg overflow-hidden bg-card">
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-foreground flex items-center justify-between hover:bg-muted/50 transition cursor-pointer"
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

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
              >
                Close
              </button>
            </div>
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
