import { withSystemPrompt } from '../../utils/proctoringSuppression';

/**
 * Ask for the student's entire screen. Must be called from a click handler
 * (getDisplayMedia needs a user gesture). Resolves to the MediaStream or throws
 * an Error with .kind: 'unsupported' | 'cancelled' | 'wrong-surface' | 'failed'.
 */
export async function shareEntireScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw Object.assign(new Error('Screen sharing is not supported in this browser.'), { kind: 'unsupported' });
  }
  let stream;
  try {
    stream = await withSystemPrompt(() => navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor' },
      audio: false,
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      preferCurrentTab: false,
    }));
  } catch (error) {
    const name = String(error?.name || '');
    const kind = name === 'NotAllowedError' || name === 'AbortError' ? 'cancelled' : 'failed';
    throw Object.assign(new Error(error?.message || 'Screen sharing failed.'), { kind });
  }

  // Browsers that report the surface let us insist on the entire screen.
  const [track] = stream.getVideoTracks();
  const surface = track?.getSettings?.().displaySurface;
  const canCheck = Boolean(navigator.mediaDevices.getSupportedConstraints?.().displaySurface) && Boolean(surface);
  if (canCheck && surface !== 'monitor') {
    stream.getTracks().forEach((t) => t.stop());
    throw Object.assign(new Error(`A ${surface} was shared instead of the entire screen.`), { kind: 'wrong-surface', surface });
  }
  return stream;
}

export const SCREEN_SHARE_HELP = {
  unsupported: {
    title: 'This browser cannot share your screen',
    steps: ['Use a recent desktop version of Chrome, Edge or Firefox to take this exam.'],
  },
  cancelled: {
    title: 'Screen sharing was cancelled',
    steps: ['This exam requires sharing your entire screen.', 'Click "Share entire screen", choose the "Entire screen" tab in the picker, select your screen, then click Share.'],
  },
  'wrong-surface': {
    title: 'Please share your entire screen',
    steps: ['A window or a browser tab was shared. In the picker choose "Entire screen" (not "Window" or "Chrome tab"), then click Share.'],
  },
  failed: {
    title: 'Screen sharing could not be started',
    steps: ['Close other screen-recording apps, then retry.', 'On macOS, allow the browser under System Settings → Privacy & Security → Screen Recording.'],
  },
};
