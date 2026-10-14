import { withSystemPrompt } from '../../utils/proctoringSuppression';

let pending = null;

/**
 * The only way the app enters fullscreen: always on <html> (never on a component
 * that can unmount), never while already fullscreen, one request at a time, and
 * inside the system-prompt grace. The app never calls exitFullscreen().
 * Must be called from a click handler (fullscreen needs a user gesture).
 */
export function requestExamFullscreen() {
  if (document.fullscreenElement) return Promise.resolve();
  if (pending) return pending;
  const root = document.documentElement;
  if (!root?.requestFullscreen) return Promise.reject(new Error('Fullscreen is not supported in this browser.'));
  pending = withSystemPrompt(() => root.requestFullscreen()).finally(() => {
    pending = null;
  });
  return pending;
}
