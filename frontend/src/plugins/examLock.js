import { registerPlugin, WebPlugin } from '@capacitor/core';

/**
 * Web fallback implementation of ExamLock for browser development & unit tests.
 */
class ExamLockWeb extends WebPlugin {
  constructor() {
    super();
    this._secure = false;
    this._keepAwake = false;
    this._lockTaskMode = 'none';
    this._inMultiWindow = false;
    this._inPip = false;
    this._interruptionFilter = 1; // INTERRUPTION_FILTER_ALL
    this._interruptionFilterName = 'ALL';
  }

  async enableSecure() {
    this._secure = true;
    return { success: true, secure: true, mock: true };
  }

  async disableSecure() {
    this._secure = false;
    return { success: true, secure: false, mock: true };
  }

  async keepAwake({ enabled = true } = {}) {
    this._keepAwake = Boolean(enabled);
    return { success: true, keepAwake: this._keepAwake, mock: true };
  }

  async startPinning() {
    this._lockTaskMode = 'pinned';
    setTimeout(() => {
      this.notifyListeners('pinningStarted', {
        timestamp: Date.now(),
        lockTaskMode: 'pinned',
        lockTaskModeCode: 2,
        mock: true,
      });
    }, 10);
    return { success: true, lockTaskMode: 'pinned', lockTaskModeCode: 2, mock: true };
  }

  async stopPinning() {
    this._lockTaskMode = 'none';
    return { success: true, lockTaskMode: 'none', lockTaskModeCode: 0, mock: true };
  }

  async getState() {
    return {
      secure: this._secure,
      keepAwake: this._keepAwake,
      lockTaskMode: this._lockTaskMode,
      lockTaskModeCode: this._lockTaskMode === 'pinned' ? 2 : 0,
      inMultiWindow: this._inMultiWindow,
      inPip: this._inPip,
      interruptionFilter: this._interruptionFilter,
      interruptionFilterName: this._interruptionFilterName,
      mock: true,
    };
  }

  // Testing helpers
  setMockInterruptionFilter(filter, name = 'UNKNOWN') {
    this._interruptionFilter = filter;
    this._interruptionFilterName = name;
  }

  setMockMultiWindow(inMultiWindow) {
    this._inMultiWindow = inMultiWindow;
  }
}

export const ExamLock = registerPlugin('ExamLock', {
  web: () => new ExamLockWeb(),
});

export default ExamLock;

