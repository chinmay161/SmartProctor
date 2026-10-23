// Browser-side audio engine: microphone -> AudioWorklet/ScriptProcessor -> MediaPipe Tasks Audio YAMNet.
// Classifies audio mono samples at ~16kHz about once per second for speech detection.
//
// NO AUDIO is recorded, stored, or uploaded to any server. Audio is analyzed purely
// in volatile memory on the client to detect speech episodes.
import { withSystemPrompt } from '../utils/proctoringSuppression';

export const AUDIO_ASSETS = Object.freeze({
  wasmBase: `/mediapipe/${import.meta.env.VITE_MEDIAPIPE_AUDIO_VERSION || '1.1.1'}/audio`,
  modelPath: '/models/yamnet.tflite',
});

// YAMNet 521 categories: speech-related subset from AudioSet.
// Note: YAMNet does not have separate "Male speech" or "Female speech" classes in its
// official label list (labels are Speech, Child speech, kid speaking, Conversation,
// Narration, monologue, Babbling, Speech synthesizer, Shout, Yell, Children shouting,
// Screaming, Whispering, Hubbub, speech noise, speech babble).
export const SPEECH_CATEGORIES = Object.freeze([
  'Speech',
  'Child speech, kid speaking',
  'Conversation',
  'Narration, monologue',
  'Babbling',
  'Speech synthesizer',
  'Shout',
  'Yell',
  'Children shouting',
  'Screaming',
  'Whispering',
  'Hubbub, speech noise, speech babble',
]);
export const SPEECH_CATEGORY_SET = new Set(SPEECH_CATEGORIES);

export const AUDIO_CONSTRAINTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});

export const classifyMicError = (error) => {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'not-found';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  if (!navigator?.mediaDevices?.getUserMedia) return 'unsupported';
  return 'unknown';
};

export function calculateRms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

let tasksAudioModulePromise = null;
export async function loadTasksAudio() {
  if (!tasksAudioModulePromise) {
    tasksAudioModulePromise = import('@mediapipe/tasks-audio');
  }
  return tasksAudioModulePromise;
}

export async function createAudioClassifier() {
  const { AudioClassifier, FilesetResolver } = await loadTasksAudio();
  const wasmFileset = await FilesetResolver.forAudioTasks(AUDIO_ASSETS.wasmBase);
  const classifier = await AudioClassifier.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: AUDIO_ASSETS.modelPath,
    },
  });
  return classifier;
}

export function createAudioEngine({
  onSample = () => {},
  onTrackEvent = () => {},
  onLevel = () => {},
  retryIntervalMs = 3000,
} = {}) {
  let stream = null;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let classifier = null;
  let running = false;
  let disposed = false;
  let recovering = false;
  let recoveryTimer = null;

  let samplesBuffer = [];
  let ambientNoiseFloor = null;
  let lastSample = null;
  let lastAudioAt = null;
  let currentLevel = 0;

  let longTaskCount = 0;
  let maxMainThreadMs = 0;
  let classifyTimer = null;

  const sampleCallbacks = new Set([onSample]);
  const trackCallbacks = new Set([onTrackEvent]);
  const levelCallbacks = new Set([onLevel]);
  const boundTrackListeners = [];

  const emitTrackEvent = (kind) => {
    for (const cb of trackCallbacks) {
      try { cb(kind); } catch (err) { console.error('[audioEngine] trackEvent error:', err); }
    }
  };

  const emitSample = (sample) => {
    lastSample = sample;
    lastAudioAt = sample.ts;
    for (const cb of sampleCallbacks) {
      try { cb(sample); } catch (err) { console.error('[audioEngine] onSample error:', err); }
    }
  };

  const emitLevel = (level) => {
    currentLevel = level;
    for (const cb of levelCallbacks) {
      try { cb(level); } catch { /* level listener error ignored */ }
    }
  };

  const unbindTrackListeners = () => {
    for (const [track, kind, handler] of boundTrackListeners) {
      track.removeEventListener(kind, handler);
    }
    boundTrackListeners.length = 0;
  };

  const bindTrack = (track) => {
    unbindTrackListeners();
    if (!track) return;
    for (const kind of ['ended', 'mute', 'unmute']) {
      const handler = () => {
        emitTrackEvent(kind);
        if (kind === 'ended') startRecovery();
      };
      track.addEventListener(kind, handler);
      boundTrackListeners.push([track, kind, handler]);
    }
  };

  const stopTracks = () => {
    unbindTrackListeners();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  };

  const openMicStream = () =>
    withSystemPrompt(() => navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS }));

  // Recovery loop: every 3 s and on devicechange
  const onDeviceChange = () => {
    if (recovering) void tryRecover();
  };

  const startRecovery = () => {
    if (recovering || disposed) return;
    recovering = true;
    if (navigator?.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }
    const attempt = async () => {
      if (!recovering || disposed) return;
      await tryRecover();
      if (recovering && !disposed) {
        recoveryTimer = setTimeout(attempt, retryIntervalMs);
      }
    };
    recoveryTimer = setTimeout(attempt, retryIntervalMs);
  };

  const stopRecovery = () => {
    recovering = false;
    if (recoveryTimer) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
    if (navigator?.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    }
  };

  async function tryRecover() {
    if (disposed) return;
    try {
      const nextStream = await openMicStream();
      if (disposed) {
        nextStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stopRecovery();
      await attachStream(nextStream);
      emitTrackEvent('restored');
    } catch {
      // Keep waiting for next retry tick or devicechange
    }
  }

  async function attachStream(nextStream) {
    stopTracks();
    stream = nextStream;
    const [track] = nextStream.getAudioTracks();
    bindTrack(track);

    if (!audioContext || audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          audioContext = new AudioCtx({ sampleRate: 16000 });
        } catch {
          audioContext = new AudioCtx();
        }
      }
    }

    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => {});
    }

    if (audioContext && stream) {
      sourceNode = audioContext.createMediaStreamSource(stream);
      await setupAudioProcessing();
    }
  }

  async function setupAudioProcessing() {
    if (!audioContext || !sourceNode) return;
    samplesBuffer = [];

    // Attempt AudioWorklet first; fallback to ScriptProcessor
    let workletSuccess = false;
    if (typeof audioContext.audioWorklet?.addModule === 'function') {
      try {
        const workletCode = `
          class AudioCollectorProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0];
              if (input && input[0]) {
                this.port.postMessage(input[0]);
              }
              return true;
            }
          }
          registerProcessor('audio-collector-processor', AudioCollectorProcessor);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const workletNode = new AudioWorkletNode(audioContext, 'audio-collector-processor');
        workletNode.port.onmessage = (event) => {
          handlePcmChunk(event.data);
        };
        sourceNode.connect(workletNode);
        // Connect to destination through a silent gain node to prevent feedback
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        workletNode.connect(silentGain);
        silentGain.connect(audioContext.destination);
        processorNode = workletNode;
        workletSuccess = true;
      } catch {
        workletSuccess = false;
      }
    }

    if (!workletSuccess && typeof audioContext.createScriptProcessor === 'function') {
      const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
      scriptNode.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        handlePcmChunk(inputData);
      };
      sourceNode.connect(scriptNode);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      scriptNode.connect(silentGain);
      silentGain.connect(audioContext.destination);
      processorNode = scriptNode;
    }
  }

  function handlePcmChunk(pcmData) {
    if (!running || disposed || !pcmData) return;
    const rms = calculateRms(pcmData);
    emitLevel(rms);

    // Collect mono samples in the buffer
    for (let i = 0; i < pcmData.length; i += 1) {
      samplesBuffer.push(pcmData[i]);
    }

    const targetRate = audioContext?.sampleRate || 16000;
    // When buffer reaches ~1 second of samples, trigger classification
    if (samplesBuffer.length >= targetRate) {
      const chunk = new Float32Array(samplesBuffer.slice(0, targetRate));
      samplesBuffer = samplesBuffer.slice(targetRate);
      performClassification(chunk, targetRate);
    }
  }

  function performClassification(chunk, sampleRate) {
    if (!classifier || !running || disposed) return;
    const t0 = performance.now();
    let results = null;
    try {
      results = classifier.classify(chunk, sampleRate);
    } catch (err) {
      console.warn('[audioEngine] classification error:', err);
      return;
    }
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      longTaskCount += 1;
      console.warn(`[audioEngine] classification long task: ${Math.round(elapsed)} ms (threshold: 50 ms)`);
    }
    if (elapsed > maxMainThreadMs) {
      maxMainThreadMs = elapsed;
    }

    let speechScore = 0;
    if (results && results.length > 0) {
      for (const classification of results[0]?.classifications || []) {
        for (const cat of classification?.categories || []) {
          if (SPEECH_CATEGORY_SET.has(cat?.categoryName)) {
            if (cat.score > speechScore) speechScore = cat.score;
          }
        }
      }
    }

    const chunkRms = calculateRms(chunk);
    if (ambientNoiseFloor === null) {
      ambientNoiseFloor = chunkRms;
    } else if (speechScore < 0.3) {
      ambientNoiseFloor = 0.95 * ambientNoiseFloor + 0.05 * chunkRms;
    } else {
      ambientNoiseFloor = 0.99 * ambientNoiseFloor + 0.01 * chunkRms;
    }

    emitSample({
      ts: Date.now(),
      speechScore: Math.round(speechScore * 100) / 100,
      rms: Math.round(chunkRms * 1000) / 1000,
    });
  }

  async function requestMic() {
    if (!navigator?.mediaDevices?.getUserMedia) {
      return { ok: false, kind: 'unsupported', error: 'Microphone not supported in this browser' };
    }
    try {
      const nextStream = await openMicStream();
      if (disposed) {
        nextStream.getTracks().forEach((t) => t.stop());
        return { ok: false, kind: 'unknown', error: 'disposed' };
      }
      await attachStream(nextStream);
      return { ok: true };
    } catch (error) {
      return { ok: false, kind: classifyMicError(error), error: error?.message || String(error) };
    }
  }

  async function start() {
    if (running) return;
    running = true;
    if (!classifier) {
      try {
        classifier = await createAudioClassifier();
      } catch (err) {
        console.error('[audioEngine] Failed to load YAMNet audio classifier:', err);
      }
    }
    if (!stream) {
      await requestMic();
    }
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => {});
    }
  }

  function stop() {
    running = false;
    if (classifyTimer) {
      clearTimeout(classifyTimer);
      classifyTimer = null;
    }
    stopRecovery();
    if (processorNode) {
      try { processorNode.disconnect(); } catch { /* ignore */ }
      processorNode = null;
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch { /* ignore */ }
      sourceNode = null;
    }
    stopTracks();
    if (audioContext && audioContext.state !== 'closed') {
      try { audioContext.close(); } catch { /* ignore */ }
      audioContext = null;
    }
  }

  function dispose() {
    disposed = true;
    stop();
    classifier?.close?.();
    classifier = null;
    sampleCallbacks.clear();
    trackCallbacks.clear();
    levelCallbacks.clear();
  }

  return {
    requestMic,
    start,
    stop,
    dispose,
    onSample: (cb) => {
      sampleCallbacks.add(cb);
      return () => sampleCallbacks.delete(cb);
    },
    onTrackEvent: (cb) => {
      trackCallbacks.add(cb);
      return () => trackCallbacks.delete(cb);
    },
    onLevel: (cb) => {
      levelCallbacks.add(cb);
      return () => levelCallbacks.delete(cb);
    },
    getStream: () => stream,
    getLevel: () => currentLevel,
    getNoiseFloor: () => ambientNoiseFloor,
    getTelemetry: () => ({
      running: running && (!audioContext || audioContext.state === 'running'),
      speechScore: lastSample?.speechScore ?? 0,
      rms: lastSample?.rms ?? 0,
      lastAudioAt,
      longTaskCount,
      maxInferenceMs: Math.round(maxMainThreadMs),
    }),
  };
}
