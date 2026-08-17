import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import Icon from '../../../components/AppIcon';

const AI_VIOLATION_MESSAGES = {
  NO_FACE: 'No face detected',
  MULTIPLE_FACES: 'Multiple faces detected',
  PHONE_DETECTED: 'Phone detected',
  LOOKING_AWAY: 'Looking away',
  SPOOF_DETECTED: 'Potential spoofing detected',
};

const isTemporalViolationEnabled = (type, securityConfig) => {
  if (type === 'NO_FACE') return Boolean(securityConfig?.detectNoFace);
  if (type === 'MULTIPLE_FACES') return Boolean(securityConfig?.detectMultipleFaces);
  if (type === 'PHONE_DETECTED') return Boolean(securityConfig?.detectMobilePhone);
  return Boolean(
    securityConfig?.enableWebcam ||
    securityConfig?.detectMultipleFaces ||
    securityConfig?.detectNoFace ||
    securityConfig?.detectMobilePhone
  );
};

const getViolationMessage = (violation) => {
  if (violation?.reason) return violation.reason;
  return AI_VIOLATION_MESSAGES[violation?.type] || 'Suspicious activity detected';
};

const SecurityMonitor = forwardRef(({ violations, sessionId, securityConfig, onAddViolation, onRequestSnapshot }, ref) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const screenVideoRef = useRef(null);
  const screenStreamRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const onAddViolationRef = useRef(onAddViolation);
  const [cameraStatus, setCameraStatus] = useState('disabled');
  const [screenStatus, setScreenStatus] = useState('disabled');
  const [audioStatus, setAudioStatus] = useState('disabled');
  const [cameraErrorMessage, setCameraErrorMessage] = useState('');
  const [screenErrorMessage, setScreenErrorMessage] = useState('');
  const [audioErrorMessage, setAudioErrorMessage] = useState('');
  const webcamRequired = Boolean(
    securityConfig?.enableWebcam ||
    securityConfig?.detectMultipleFaces ||
    securityConfig?.detectNoFace ||
    securityConfig?.detectMobilePhone
  );
  const screenRecordingEnabled = Boolean(securityConfig?.enableScreenRecording);
  const audioMonitoringEnabled = Boolean(securityConfig?.audioMonitoring);

  useEffect(() => {
    onAddViolationRef.current = onAddViolation;
  }, [onAddViolation]);

  const stopStream = (streamRef) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const attachStreamToVideo = async (videoElement, stream) => {
    if (!videoElement || !stream) return;
    videoElement.srcObject = stream;

    const ensurePlaying = async () => {
      try {
        await videoElement.play();
      } catch (_) {
        // Ignore autoplay timing issues; metadata event retries below.
      }
    };

    if (videoElement.readyState >= 1) {
      await ensurePlaying();
      return;
    }

    const handleLoadedMetadata = () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      void ensurePlaying();
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    await ensurePlaying();
  };

  const getMediaErrorMessage = (error, label) => {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return `${label} permission was denied in the browser.`;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return `No ${label.toLowerCase()} device was found.`;
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return `${label} is busy or unavailable to Chrome.`;
    }
    if (name === 'AbortError') {
      return `${label} request was cancelled.`;
    }
    return `${label} could not be started.`;
  };

  useImperativeHandle(ref, () => ({
    captureImage: () => {
      if (cameraStatus !== 'active' || !videoRef.current || !canvasRef.current || document.hidden) {
        return null;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
  }), [cameraStatus]);

  useEffect(() => {
    if (!webcamRequired) {
      stopStream(webcamStreamRef);
      setCameraStatus('disabled');
      setCameraErrorMessage('');
      return;
    }

    let mounted = true;

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        webcamStreamRef.current = stream;
        if (videoRef.current) {
          await attachStreamToVideo(videoRef.current, stream);
        }
        setCameraStatus('active');
        setCameraErrorMessage('');
      } catch (err) {
        if (mounted) {
          setCameraStatus('error');
          setCameraErrorMessage(getMediaErrorMessage(err, 'Camera'));
          console.error('Failed to access camera:', err);
        }
      }
    };

    initCamera();

    return () => {
      mounted = false;
      stopStream(webcamStreamRef);
    };
  }, [webcamRequired]);

  useEffect(() => {
    if (cameraStatus !== 'active' || !videoRef.current || !webcamStreamRef.current) return;
    void attachStreamToVideo(videoRef.current, webcamStreamRef.current);
  }, [cameraStatus]);

  useEffect(() => {
    if (!screenRecordingEnabled) {
      stopStream(screenStreamRef);
      setScreenStatus('disabled');
      setScreenErrorMessage('');
      return;
    }

    let mounted = true;

    const initScreenCapture = async () => {
      try {
        setScreenStatus('initializing');
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
          },
          audio: false,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include',
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        screenStreamRef.current = stream;
        const [track] = stream.getVideoTracks();
        if (track) {
          track.addEventListener('ended', () => {
            setScreenStatus('error');
            onAddViolationRef.current?.('Screen sharing stopped', 'SCREEN_SHARE_STOPPED', 1.0);
          });
        }
        if (screenVideoRef.current) {
          await attachStreamToVideo(screenVideoRef.current, stream);
        }
        setScreenStatus('active');
        setScreenErrorMessage('');
      } catch (error) {
        if (mounted) {
          setScreenStatus('error');
          setScreenErrorMessage(getMediaErrorMessage(error, 'Screen sharing'));
          console.error('Failed to access screen capture:', error);
        }
      }
    };

    initScreenCapture();

    return () => {
      mounted = false;
      stopStream(screenStreamRef);
    };
  }, [screenRecordingEnabled]);

  useEffect(() => {
    if (screenStatus !== 'active' || !screenVideoRef.current || !screenStreamRef.current) return;
    void attachStreamToVideo(screenVideoRef.current, screenStreamRef.current);
  }, [screenStatus]);

  useEffect(() => {
    if (!audioMonitoringEnabled) {
      stopStream(audioStreamRef);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      setAudioStatus('disabled');
      setAudioErrorMessage('');
      return;
    }

    let mounted = true;
    let intervalId = null;
    let lastTriggeredAt = 0;

    const initAudioMonitoring = async () => {
      try {
        setAudioStatus('initializing');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          setAudioStatus('error');
          setAudioErrorMessage('This browser does not support audio monitoring.');
          return;
        }

        audioStreamRef.current = stream;
        audioContextRef.current = new AudioCtx();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        setAudioStatus('active');
        setAudioErrorMessage('');

        const dataArray = new Uint8Array(analyserRef.current.fftSize);
        intervalId = window.setInterval(() => {
          if (!analyserRef.current || document.hidden) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let peak = 0;
          for (let i = 0; i < dataArray.length; i += 1) {
            peak = Math.max(peak, Math.abs(dataArray[i] - 128));
          }
          const normalizedPeak = peak / 128;
          const now = Date.now();
          if (normalizedPeak >= 0.28 && now - lastTriggeredAt > 10000) {
            lastTriggeredAt = now;
            onAddViolationRef.current?.('Suspicious audio detected', 'AUDIO_ACTIVITY', Number(normalizedPeak.toFixed(2)));
          }
        }, 2500);
      } catch (error) {
        if (mounted) {
          setAudioStatus('error');
          setAudioErrorMessage(getMediaErrorMessage(error, 'Microphone'));
          console.error('Failed to access microphone:', error);
        }
      }
    };

    initAudioMonitoring();

    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
      stopStream(audioStreamRef);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    };
  }, [audioMonitoringEnabled]);

  useEffect(() => {
    if (cameraStatus !== 'active' || !sessionId) return;

    let mounted = true;
    let isProcessing = false;
    let captureInterval = 3000;
    let intervalId = null;

    const lastViolationTime = {};
    const COOLDOWN = 10000; // 10s cooldown per violation type 

    const shouldTrigger = (type) => {
      const now = Date.now();
      if (!lastViolationTime[type] || now - lastViolationTime[type] > COOLDOWN) {
        lastViolationTime[type] = now;
        return true;
      }
      return false;
    };

    const captureAndSend = async (retries = 2) => {
      if (!mounted || !videoRef.current || !canvasRef.current) return;
      
      // 3. No Visibility Check - Avoid firing if document is hidden
      if (document.hidden) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

      try {
        const payload = {
          image: imageBase64,
          timestamp: new Date().toISOString(),
        };

        const response = await onRequestSnapshot?.(sessionId, payload);

        if (mounted && response) {
          let isSuspicious = false;
          const faceCount = Number(response.face_count ?? 0);
          const phoneDetected = Boolean(response.phone?.detected ?? response.phone_detected);
          const phoneConfidence = Number(response.phone?.confidence ?? response.phone_confidence ?? 0);
          const headPose = response.head_pose || {};

          // Convert response to violations
          if ((response.face_detected === false || faceCount === 0) && securityConfig?.detectNoFace) {
            isSuspicious = true;
            if (shouldTrigger('NO_FACE')) onAddViolationRef.current?.('No face detected', 'NO_FACE', 1.0);
          } else if ((faceCount > 1 || response.multiple_faces) && securityConfig?.detectMultipleFaces) {
            isSuspicious = true;
            if (shouldTrigger('MULTIPLE_FACES')) onAddViolationRef.current?.('Multiple faces detected', 'MULTIPLE_FACES', 1.0);
          }

          if (phoneDetected && securityConfig?.detectMobilePhone) {
            const conf = phoneConfidence || 0.99;
            // 4. Add Confidence Threshold
            if (conf >= 0.7) {
              isSuspicious = true;
              if (shouldTrigger('PHONE_DETECTED')) onAddViolationRef.current?.('Phone detected', 'PHONE_DETECTED', conf);
            }
          }

          if (headPose.looking_away) {
            isSuspicious = true;
            if (shouldTrigger('LOOKING_AWAY')) {
              onAddViolationRef.current?.('Looking away', 'LOOKING_AWAY', Number(headPose.confidence || 1.0));
            }
          }

          for (const violation of response.violations || []) {
            if (!isTemporalViolationEnabled(violation?.type, securityConfig)) continue;
            if (!shouldTrigger(violation.type)) continue;

            isSuspicious = true;
            onAddViolationRef.current?.(
              getViolationMessage(violation),
              violation.type,
              Number(violation.confidence || 1.0)
            );
          }

          // 6. Dynamic Capture Interval
          const nextInterval = isSuspicious ? 1000 : 3000;
          if (nextInterval !== captureInterval) {
            captureInterval = nextInterval;
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(runCapture, captureInterval);
          }
        }
      } catch (error) {
        if (retries > 0 && mounted) {
          // Recursive retry with slight delay
          await new Promise(r => setTimeout(r, 1000));
          return captureAndSend(retries - 1);
        } else {
          // 5. Better Error Handling
          console.warn('AI snapshot failed', error);
        }
      }
    };

    // 1. Backpressure Control Hook
    const runCapture = async () => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        await captureAndSend();
      } finally {
        isProcessing = false;
      }
    };

    intervalId = setInterval(runCapture, captureInterval);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [cameraStatus, sessionId, onAddViolation, onRequestSnapshot, securityConfig]);

  return (
    <div className="p-4 border-t border-border flex flex-col h-full bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Security Monitor</h3>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted-foreground">Active</span>
        </div>
      </div>

      {/* Webcam Status */}
      <div className="mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Icon
              name="Camera"
              size={16}
              className={cameraStatus === 'active' ? 'text-success' : 'text-muted-foreground'}
            />
            <span className="text-xs font-medium text-foreground">Webcam Monitoring</span>
          </div>
          {cameraStatus === 'active' && webcamRequired && (
            <span className="text-[10px] bg-success/20 text-success px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              AI Active
            </span>
          )}
        </div>
        <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center relative">
          {cameraStatus === 'active' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          ) : cameraStatus === 'error' ? (
            <div className="text-center p-4">
              <Icon name="AlertTriangle" size={24} className="text-error mx-auto mb-2" />
              <p className="text-xs text-error">Camera Access Failed</p>
              {cameraErrorMessage && (
                <p className="text-[11px] text-muted-foreground mt-2">{cameraErrorMessage}</p>
              )}
            </div>
          ) : cameraStatus === 'disabled' ? (
            <div className="text-center p-4">
              <Icon name="CameraOff" size={24} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Monitoring Disabled</p>
            </div>
          ) : (
            <div className="text-center p-4">
              <Icon name="Loader" size={24} className="text-muted-foreground mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Initializing...</p>
            </div>
          )}
          {/* Hidden Canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      <div className="mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Icon
              name="Monitor"
              size={16}
              className={screenStatus === 'active' ? 'text-success' : 'text-muted-foreground'}
            />
            <span className="text-xs font-medium text-foreground">Screen Recording</span>
          </div>
          {screenStatus === 'active' && (
            <span className="text-[10px] bg-success/20 text-success px-2 py-0.5 rounded font-semibold">Active</span>
          )}
        </div>
        <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center relative">
          {screenStatus === 'active' ? (
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : screenStatus === 'error' ? (
            <div className="text-center p-4">
              <Icon name="AlertTriangle" size={24} className="text-error mx-auto mb-2" />
              <p className="text-xs text-error">Screen share failed</p>
              {screenErrorMessage && (
                <p className="text-[11px] text-muted-foreground mt-2">{screenErrorMessage}</p>
              )}
            </div>
          ) : screenStatus === 'disabled' ? (
            <div className="text-center p-4">
              <Icon name="Monitor" size={24} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Screen recording disabled</p>
            </div>
          ) : (
            <div className="text-center p-4">
              <Icon name="Loader" size={24} className="text-muted-foreground mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Requesting screen share...</p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Icon
              name="Mic"
              size={16}
              className={audioStatus === 'active' ? 'text-success' : 'text-muted-foreground'}
            />
            <span className="text-xs font-medium text-foreground">Audio Monitoring</span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
            audioStatus === 'active'
              ? 'bg-success/20 text-success'
                : audioStatus === 'error'
                ? 'bg-error/20 text-error'
                : 'bg-muted text-muted-foreground'
          }`}>
            {audioStatus === 'active' ? 'Active' : audioStatus === 'error' ? 'Error' : audioStatus === 'initializing' ? 'Starting' : 'Disabled'}
          </span>
        </div>
        {audioStatus === 'error' && audioErrorMessage && (
          <p className="text-[11px] text-muted-foreground mt-2">{audioErrorMessage}</p>
        )}
      </div>

      {/* Violations Log */}
      <div className="flex-1 overflow-y-auto mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">Violations</span>
          <span
            className={`text-xs font-semibold ${
              violations?.length === 0 ? 'text-success' : 'text-error'
            }`}
          >
            {violations?.length || 0}
          </span>
        </div>
        {violations?.length === 0 ? (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <Icon name="CheckCircle" size={16} className="text-success" />
              <span className="text-xs text-success">No violations detected</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {violations
              ?.slice(-5)
              ?.reverse()
              ?.map((violation) => (
                <div
                  key={violation?.id}
                  className="p-2 bg-error/10 border border-error/20 rounded text-xs"
                >
                  <div className="flex items-start space-x-2">
                    <Icon name="AlertTriangle" size={14} className="text-error mt-0.5" />
                    <div className="flex-1">
                      <p className="text-error font-medium">{violation?.message}</p>
                      <p className="text-muted-foreground text-[10px] mt-1">
                        {violation?.timestamp?.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Security Features */}
      <div className="mt-auto pt-4 border-t border-border">
        <p className="text-xs font-medium text-foreground mb-2">Active Security</p>
        <div className="space-y-2">
          {[
            securityConfig?.browserLockdown && 'Browser lockdown',
            securityConfig?.detectTabSwitch && 'Tab switch detection',
            screenRecordingEnabled && 'Screen recording',
            securityConfig?.disableCopyPaste && 'Copy-paste disabled',
            securityConfig?.disableRightClick && 'Right-click disabled',
            securityConfig?.enableProctoredWatermark && 'Watermark enabled',
          ].filter(Boolean).map((label) => (
            <div key={label} className="flex items-center space-x-2 text-xs text-muted-foreground">
              <Icon name="Shield" size={12} className="text-success" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default SecurityMonitor;
