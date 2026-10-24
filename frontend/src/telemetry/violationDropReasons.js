// Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
/**
 * Shared violation drop reasons for the flight recorder.
 * Every drop path between inference, temporal engine, and persistViolation
 * records violation_dropped with one of these codes.
 */
export const VIOLATION_DROP_REASONS = Object.freeze({
  RULE_DISABLED: 'rule_disabled',
  GRACE: 'grace',
  UNLOADING: 'unloading',
  EPISODE_OPEN: 'episode_open',
  COOLDOWN: 'cooldown',
  CAMERA_LOST: 'camera_lost',
  MIC_SUSPENDED: 'mic_suspended',
  NOT_MONITORING: 'not_monitoring',
  AUDIO_NOT_RUNNING: 'audio_not_running',
  INSUFFICIENT_SAMPLES: 'insufficient_samples',
  RATIO_BELOW_THRESHOLD: 'ratio_below_threshold',
  CONFIDENCE_THRESHOLD: 'confidence_threshold',
  DOCUMENT_HIDDEN: 'document_hidden',
  EXAM_ENDED: 'exam_ended',
  RATE_LIMITED: 'rate_limited',
  SHADOW_MODE: 'shadow_mode',
  OFFLINE_QUEUED: 'offline_queued',
  UNMAPPED_TYPE: 'unmapped_type',
});
