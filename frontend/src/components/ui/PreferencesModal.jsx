import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';
import { useTheme } from '../../context/ThemeContext';

/**
 * Play a gentle synthetic Web Audio chime for alert testing
 */
const playTestAlertSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('AudioContext playback error', err);
  }
};

const PreferencesModal = ({ isOpen, onClose }) => {
  const { theme, setTheme } = useTheme();

  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('sp:pref:sound') !== 'false';
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    return localStorage.getItem('sp:pref:refresh') || '15s';
  });
  const [compactCards, setCompactCards] = useState(() => {
    return localStorage.getItem('sp:pref:compact') === 'true';
  });
  const [prefSavedMsg, setPrefSavedMsg] = useState(false);

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

  const handleSavePreferences = (e) => {
    e.preventDefault();
    localStorage.setItem('sp:pref:sound', String(soundEnabled));
    localStorage.setItem('sp:pref:refresh', refreshInterval);
    localStorage.setItem('sp:pref:compact', String(compactCards));

    setPrefSavedMsg(true);
    setTimeout(() => setPrefSavedMsg(false), 3000);
  };

  return (
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
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="Settings" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-heading font-semibold text-foreground">Preferences</h2>
              <p className="text-xs text-muted-foreground">Customize appearance, audio alerts, and telemetry rates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSavePreferences} className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {prefSavedMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center space-x-2 animate-in fade-in">
              <Icon name="CheckCircle" size={16} />
              <span>Preferences saved successfully!</span>
            </div>
          )}

          {/* Theme Selector */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">Display Theme</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'light', label: 'Light', icon: 'Sun' },
                { id: 'dark', label: 'Dark', icon: 'Moon' },
                { id: 'system', label: 'System', icon: 'Laptop' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id)}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition ${
                    theme === item.id
                      ? 'border-primary bg-primary/10 text-primary font-semibold shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name={item.icon} size={20} />
                  <span className="text-xs">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sound Feedback */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Auditory Violation Alert</p>
                <p className="text-[11px] text-muted-foreground">Play a soft audio chime when high-severity cheating is detected</p>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={playTestAlertSound}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-xs font-medium transition"
              >
                <Icon name="Volume2" size={14} />
                <span>Test Alert Sound</span>
              </button>
            </div>
          </div>

          {/* Monitoring Preferences */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-foreground">Exam Monitoring & Telemetry</p>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Live Dashboard Polling Frequency</label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              >
                <option value="10s">Every 10 seconds (Recommended for Live Exams)</option>
                <option value="15s">Every 15 seconds (Standard)</option>
                <option value="30s">Every 30 seconds (Low Bandwidth)</option>
                <option value="manual">Manual Refresh Only</option>
              </select>
            </div>

            <label className="flex items-center justify-between cursor-pointer pt-2">
              <div>
                <p className="text-xs font-medium text-foreground">Compact Metric Cards</p>
                <p className="text-[11px] text-muted-foreground">Display condensed stat chips in exam lists</p>
              </div>
              <input
                type="checkbox"
                checked={compactCards}
                onChange={(e) => setCompactCards(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-sm transition"
            >
              Save Preferences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PreferencesModal;
