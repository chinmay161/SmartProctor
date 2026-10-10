// Single source of truth for proctoring violation severity on the client.
// Vision types use this explicit map; every other type keeps the legacy
// message-based rule the exam portal has always used.
export const VISION_VIOLATION_SEVERITY = Object.freeze({
  MULTIPLE_FACES: 'major',
  PHONE_DETECTED: 'major',
  BOOK_DETECTED: 'major',
  PROCTORING_STOPPED: 'major',
  CAMERA_DISCONNECTED: 'major',
  NO_FACE: 'minor',
  LOOKING_AWAY: 'minor',
  CAMERA_FROZEN: 'minor',
  NO_BLINK: 'minor',
});

const legacySeverityFromMessage = (message) => {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('fullscreen')) return 'severe';
  if (lower.includes('tab')) return 'major';
  return 'minor';
};

export const severityForViolation = (type, message) =>
  VISION_VIOLATION_SEVERITY[type] || legacySeverityFromMessage(message);
