import React, { useState } from 'react';
import PreExamGate from './PreExamGate';
import { HIDDEN_VIDEO_STYLE, INFERENCE_MODE, useVisionProctoring } from './useVisionProctoring';
import ReportProblemModal from '../feedback/ReportProblemModal';

/**
 * Dashboard "Test my device": the same camera / model / fps / calibration check the
 * exam runs, without calling any exam API. Also warms the browser cache with the
 * WASM runtime and models before exam day.
 */
const DeviceTestModal = ({ onClose }) => {
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
        onRequestReportProblem={() => setShowReportProblem(true)}
      />
      {showReportProblem && (
        <ReportProblemModal onClose={() => setShowReportProblem(false)} />
      )}
    </>
  );
};

export default DeviceTestModal;

