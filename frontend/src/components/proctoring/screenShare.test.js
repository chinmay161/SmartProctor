import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareEntireScreen } from './screenShare';
import { isSystemPromptGraceActive, resetSuppressionForTests } from '../../utils/proctoringSuppression';

const fakeStream = (surface) => {
  const track = { stop: vi.fn(), getSettings: () => (surface ? { displaySurface: surface } : {}) };
  return { track, stream: { getVideoTracks: () => [track], getTracks: () => [track] } };
};

const stubMediaDevices = (getDisplayMedia, supportsSurface = true) => {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getDisplayMedia,
      getSupportedConstraints: () => ({ displaySurface: supportsSurface }),
    },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetSuppressionForTests();
});

describe('shareEntireScreen', () => {
  it('asks for the entire screen and accepts a monitor share', async () => {
    const { stream } = fakeStream('monitor');
    const gdm = vi.fn(async () => stream);
    stubMediaDevices(gdm);
    await expect(shareEntireScreen()).resolves.toBe(stream);
    expect(gdm.mock.calls[0][0]).toMatchObject({ video: { displaySurface: 'monitor' }, audio: false, selfBrowserSurface: 'exclude' });
    expect(isSystemPromptGraceActive()).toBe(true); // the picker counts as an app-initiated prompt
  });

  it.each(['window', 'browser'])('rejects a %s share and stops it', async (surface) => {
    const { stream, track } = fakeStream(surface);
    stubMediaDevices(vi.fn(async () => stream));
    await expect(shareEntireScreen()).rejects.toMatchObject({ kind: 'wrong-surface', surface });
    expect(track.stop).toHaveBeenCalled();
  });

  it('accepts the share when the browser cannot report the surface', async () => {
    const { stream } = fakeStream(undefined);
    stubMediaDevices(vi.fn(async () => stream), false);
    await expect(shareEntireScreen()).resolves.toBe(stream);
  });

  it('maps a cancelled picker and a missing API to clear error kinds', async () => {
    stubMediaDevices(vi.fn(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); }));
    await expect(shareEntireScreen()).rejects.toMatchObject({ kind: 'cancelled' });

    vi.stubGlobal('navigator', { mediaDevices: {} });
    await expect(shareEntireScreen()).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

describe('screen share stop and recovery state logic', () => {
  it('triggers SCREEN_SHARE_STOPPED violation and enters blocked state when track ends', () => {
    let screenShareBlocked = false;
    let screenShareLost = null;
    const violations = [];

    const handleTrackEnded = (screenRecordingRequired) => {
      if (screenRecordingRequired) {
        screenShareBlocked = true;
      }
      screenShareLost = {
        title: 'Screen sharing stopped',
        steps: ['This exam requires sharing your entire screen. Click "Share entire screen" to continue.'],
      };
      violations.push({
        message: 'Screen sharing stopped',
        type: 'SCREEN_SHARE_STOPPED',
        confidence: 1.0,
        severity: 'major',
      });
    };

    handleTrackEnded(true);

    expect(screenShareBlocked).toBe(true);
    expect(screenShareLost.title).toBe('Screen sharing stopped');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      type: 'SCREEN_SHARE_STOPPED',
      severity: 'major',
    });
  });

  it('successful reshare clears blocked state, restores stream, and activates system prompt grace', async () => {
    const { stream } = fakeStream('monitor');
    stubMediaDevices(vi.fn(async () => stream));

    let screenShareBlocked = true;
    let screenShareLost = { title: 'Screen sharing stopped' };
    let currentStream = null;

    const reshareScreen = async () => {
      const newStream = await shareEntireScreen();
      screenShareLost = null;
      screenShareBlocked = false;
      currentStream = newStream;
    };

    await reshareScreen();

    expect(screenShareBlocked).toBe(false);
    expect(screenShareLost).toBeNull();
    expect(currentStream).toBe(stream);
    expect(isSystemPromptGraceActive()).toBe(true);
  });
});

