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
