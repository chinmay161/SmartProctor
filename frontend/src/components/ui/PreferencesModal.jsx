import React, { useEffect } from 'react';
import Icon from '../AppIcon';
import { useTheme } from '../../context/ThemeContext';

const PreferencesModal = ({ isOpen, onClose }) => {
  const { theme, setTheme } = useTheme();

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

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
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
              <p className="text-xs text-muted-foreground">Customize application appearance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 text-sm">
          {/* Theme Selector */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">Display Theme</label>
            <p className="text-xs text-muted-foreground mb-3">
              Select your interface color scheme. System follows your operating system preference.
            </p>
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
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition cursor-pointer ${
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

          <div className="flex justify-end pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreferencesModal;
