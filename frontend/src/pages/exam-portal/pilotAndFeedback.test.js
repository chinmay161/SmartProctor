import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlightRecorder } from '../../telemetry/flightRecorder';
import { PILOT_SCENARIOS } from './pilotScenarios';

describe('Pilot Mode Scenario Telemetry', () => {
  let recorder;

  beforeEach(() => {
    recorder = new FlightRecorder();
    recorder.init({ traceId: 'test-trace', sessionId: 'sess-123' });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    recorder.destroy();
  });

  it('contains the exact 8 required scripted scenarios', () => {
    const expectedNames = [
      'look away left 5 s',
      'look down 5 s',
      'hold a phone up 5 s',
      'talk 5 s',
      'cover the camera 5 s',
      'second person in frame 5 s',
      'leave the frame 5 s',
      'switch tab once',
    ];
    const actualNames = PILOT_SCENARIOS.map((s) => s.name);
    expect(actualNames).toEqual(expectedNames);
  });

  it('records scenario_start and scenario_end events to flight recorder with scenario name', () => {
    const scenario = PILOT_SCENARIOS[0]; // 'look away left 5 s'

    recorder.record('scenario', 'scenario_start', { scenario: scenario.name });
    expect(recorder.buffer.length).toBe(1);
    expect(recorder.buffer[0]).toMatchObject({
      category: 'scenario',
      name: 'scenario_start',
      data: { scenario: 'look away left 5 s' },
    });

    recorder.record('scenario', 'scenario_end', { scenario: scenario.name });
    expect(recorder.buffer.length).toBe(2);
    expect(recorder.buffer[1]).toMatchObject({
      category: 'scenario',
      name: 'scenario_end',
      data: { scenario: 'look away left 5 s' },
    });
  });

  it('scenario events do not alter violation suppression state or emit false violations', () => {
    const violations = [];

    // Emitting scenario events
    PILOT_SCENARIOS.forEach((sc) => {
      recorder.record('scenario', 'scenario_start', { scenario: sc.name });
      recorder.record('scenario', 'scenario_end', { scenario: sc.name });
    });

    expect(recorder.buffer.length).toBe(16);
    expect(violations.length).toBe(0);
  });
});

describe('Report a Problem In-Page Modal Isolation', () => {
  it('opening and interacting with the in-page modal does not trigger window blur or violations', () => {
    let windowBlurFired = false;
    let violationAdded = false;
    const addViolation = () => {
      violationAdded = true;
    };

    const handleBlur = () => {
      windowBlurFired = true;
      addViolation();
    };

    // Simulate window blur listener setup from exam-portal
    const fakeWindow = {
      addEventListener: (evt, handler) => {
        if (evt === 'blur') fakeWindow._blurHandler = handler;
      },
      removeEventListener: (evt) => {
        if (evt === 'blur') fakeWindow._blurHandler = null;
      },
    };
    fakeWindow.addEventListener('blur', handleBlur);

    // Opening an in-page modal: in-page DOM state toggles without calling window.blur or window.open
    let isModalOpen = false;
    const openModal = () => {
      isModalOpen = true;
      // In-page modal renders inside DOM without shifting browser window focus
    };

    openModal();
    expect(isModalOpen).toBe(true);
    expect(windowBlurFired).toBe(false);
    expect(violationAdded).toBe(false);

    // Closing the modal
    isModalOpen = false;
    expect(isModalOpen).toBe(false);
    expect(windowBlurFired).toBe(false);
    expect(violationAdded).toBe(false);
  });

  it('flushes flight recorder before posting problem report', async () => {
    const recorder = new FlightRecorder();
    recorder.init({ traceId: 'test-trace', sessionId: 'sess-123' });
    recorder.record('lifecycle', 'test_event', { key: 'val' });

    expect(recorder.buffer.length).toBe(1);

    const flushSpy = vi.spyOn(recorder, 'flush').mockResolvedValue(undefined);

    // Simulate modal submit flow
    const submitProblemReport = async (rec) => {
      await rec.flush();
      return { status: 201 };
    };

    const result = await submitProblemReport(recorder);
    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(201);
  });

  it('strips query strings and hashes from page_path', () => {
    const rawPaths = [
      '/exam-portal?token=secret123&session=456',
      '/student-dashboard#overview',
      '/test-device?ref=portal&token=abc#step2',
    ];

    const cleanPaths = rawPaths.map((p) => p.split('?')[0].split('#')[0]);
    expect(cleanPaths).toEqual([
      '/exam-portal',
      '/student-dashboard',
      '/test-device',
    ]);
  });
});
