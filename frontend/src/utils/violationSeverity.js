// Single source of truth for proctoring violation severity on the client.
// Vision types use this explicit map; every other type keeps the legacy
// message-based rule the exam portal has always used.
export const VISION_VIOLATION_SEVERITY = Object.freeze({
  MULTIPLE_FACES: 'major',
  PHONE_DETECTED: 'major',
  BOOK_DETECTED: 'major',
  PROCTORING_STOPPED: 'major',
  CAMERA_DISCONNECTED: 'major',
  MIC_DISCONNECTED: 'major',
  NO_FACE: 'minor',
  LOOKING_AWAY: 'minor',
  CAMERA_FROZEN: 'minor',
  NO_BLINK: 'minor',
  VOICE_DETECTED: 'minor',
  // Not a vision type, but reported by the client-side proctoring flow on resume.
  PAGE_RELOAD: 'minor',
});

export const VIOLATION_DISPLAY_INFO = Object.freeze({
  VOICE_DETECTED: { label: 'Voice detected', icon: 'Mic' },
  MIC_DISCONNECTED: { label: 'Microphone disconnected', icon: 'MicOff' },
  NO_FACE: { label: 'No face detected', icon: 'UserX' },
  MULTIPLE_FACES: { label: 'Multiple faces detected', icon: 'Users' },
  LOOKING_AWAY: { label: 'Looking away', icon: 'EyeOff' },
  PHONE_DETECTED: { label: 'Phone detected', icon: 'Smartphone' },
  BOOK_DETECTED: { label: 'Book detected', icon: 'BookOpen' },
  CAMERA_FROZEN: { label: 'Camera image frozen', icon: 'CameraOff' },
  CAMERA_DISCONNECTED: { label: 'Camera disconnected', icon: 'VideoOff' },
  NO_BLINK: { label: 'No blink detected', icon: 'Eye' },
  PROCTORING_STOPPED: { label: 'Proctoring stopped', icon: 'ShieldAlert' },
  PAGE_RELOAD: { label: 'Page reloaded', icon: 'RotateCcw' },
  TAB_SWITCH: { label: 'Tab switch detected', icon: 'ExternalLink' },
  WINDOW_BLUR: { label: 'Window blur detected', icon: 'Minimize2' },
  FULLSCREEN_EXIT: { label: 'Exited fullscreen', icon: 'Minimize' },
  AUDIO_ACTIVITY: { label: 'Suspicious audio detected', icon: 'Volume2' },
});

export const formatViolationType = (type) =>
  VIOLATION_DISPLAY_INFO[type]?.label || (type ? String(type).replace(/_/g, ' ') : 'Unknown Violation');

export const getViolationIcon = (type) =>
  VIOLATION_DISPLAY_INFO[type]?.icon || 'AlertTriangle';

const legacySeverityFromMessage = (message) => {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('fullscreen')) return 'severe';
  if (lower.includes('tab')) return 'major';
  return 'minor';
};

export const severityForViolation = (type, message) =>
  VISION_VIOLATION_SEVERITY[type] || legacySeverityFromMessage(message);

