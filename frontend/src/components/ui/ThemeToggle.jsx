import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import Icon from '../AppIcon';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef?.current && !dropdownRef?.current?.contains(event?.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themeOptions = [
    { value: 'light', label: 'Light', icon: 'Sun' },
    { value: 'dark', label: 'Dark', icon: 'Moon' },
    { value: 'system', label: 'System', icon: 'Monitor' }
  ];

  const currentThemeOption = themeOptions?.find(opt => opt?.value === theme) || themeOptions?.[2];

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-smooth"
        aria-label="Toggle theme"
      >
        <Icon name={currentThemeOption?.icon} size={20} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="py-1">
            {themeOptions?.map((option) => (
              <button
                key={option?.value}
                onClick={() => handleThemeChange(option?.value)}
                className={`w-full px-4 py-2 text-left text-sm transition-smooth flex items-center space-x-3 ${
                  theme === option?.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <Icon name={option?.icon} size={16} />
                <span>{option?.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;