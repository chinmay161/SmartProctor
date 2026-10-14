import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isSystemPromptGraceActive,
  markUnloading,
  resetSuppressionForTests,
  shouldSuppressViolation,
  withSystemPrompt,
} from './proctoringSuppression';

let clock = 0;

beforeEach(() => {
  clock = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  resetSuppressionForTests();
});

afterEach(() => vi.restoreAllMocks());

describe('system prompt grace', () => {
  it('suppresses focus/fullscreen types while a prompt is pending and 1.5 s after', async () => {
    let resolvePrompt;
    const pending = withSystemPrompt(() => new Promise((r) => { resolvePrompt = r; }));
    expect(isSystemPromptGraceActive()).toBe(true);
    for (const type of ['FULLSCREEN_EXIT', 'WINDOW_BLUR', 'TAB_SWITCH', 'VISIBILITY_CHANGE']) {
      expect(shouldSuppressViolation(type)).toBe(true);
    }
    clock += 20_000; // a slow picker
    expect(shouldSuppressViolation('TAB_SWITCH')).toBe(true);

    resolvePrompt('stream');
    await expect(pending).resolves.toBe('stream');
    clock += 1_400;
    expect(shouldSuppressViolation('WINDOW_BLUR')).toBe(true);
    clock += 200;
    expect(shouldSuppressViolation('WINDOW_BLUR')).toBe(false);
  });

  it('also covers prompts that reject (e.g. permission denied)', async () => {
    await expect(withSystemPrompt(async () => { throw new Error('denied'); })).rejects.toThrow('denied');
    expect(shouldSuppressViolation('FULLSCREEN_EXIT')).toBe(true);
  });

  it('never suppresses other types during grace', async () => {
    await withSystemPrompt(async () => {});
    expect(shouldSuppressViolation('NO_FACE')).toBe(false);
    expect(shouldSuppressViolation('PHONE_DETECTED')).toBe(false);
  });
});

describe('unloading', () => {
  it('suppresses every type once the page is unloading', () => {
    expect(shouldSuppressViolation('CAMERA_DISCONNECTED')).toBe(false);
    markUnloading();
    for (const type of ['CAMERA_DISCONNECTED', 'NO_FACE', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'TAB_SWITCH']) {
      expect(shouldSuppressViolation(type)).toBe(true);
    }
  });
});
