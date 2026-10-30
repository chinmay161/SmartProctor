import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import PreExamGate from './PreExamGate';
import { HIDDEN_VIDEO_STYLE, INFERENCE_MODE, useVisionProctoring } from './useVisionProctoring';
import ReportProblemModal from '../feedback/ReportProblemModal';
import flightRecorder from '../../telemetry/flightRecorder';

/**
 * Dashboard "Test my device": the same camera / model / fps / calibration check the
 * exam runs, without calling any exam API. Also warms the browser cache with the
 * WASM runtime and models before exam day.
 */
const DeviceTestModal = ({ onClose }) => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  useEffect(() => {
    if (isAuthenticated && getAccessTokenSilently) {
      flightRecorder.setAccessTokenGetter(() =>
        getAccessTokenSilently({
          authorizationParams: { audience: auth0Audience },
        })
      );
    } else {
      flightRecorder.setAccessTokenGetter(null);
    }
  }, [isAuthenticated, getAccessTokenSilently, auth0Audience]);

  const vision = useVisionProctoring({ detectObjects: true, micRequired: true });
  const [showReportProblem, setShowReportProblem] = useState(false);

  const close = () => {
    vision.dispose();
    onClose?.();
  };

  return (
    <>
      <video ref={vision.videoRef} style={HIDDEN_VIDEO_STYLE} muted playsInline autoPlay aria-hidden="true" />
      <PreExamGate
        vision={vision}
        micRequired={true}
        variant={INFERENCE_MODE === 'server' ? 'permission-only' : 'device-test'}
        title="Test my device"
        onComplete={close}
        onCancel={close}
        cancelLabel="Close"
        onRequestReportProblem={isAuthenticated ? () => setShowReportProblem(true) : undefined}
      />
      {showReportProblem && (
        <ReportProblemModal onClose={() => setShowReportProblem(false)} />
      )}
    </>
  );
};

export default DeviceTestModal;

