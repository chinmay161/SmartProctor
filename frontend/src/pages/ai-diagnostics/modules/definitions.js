/**
 * Module Definitions and Canvas Overlay Renderers for AI Diagnostics Suite
 */

export const MODULE_TABS = [
  { id: 'overview', label: 'Master Pipeline', icon: 'LayoutDashboard', group: 'core', requiredBackend: ['all'] },
  { id: 'face', label: 'Face Detection', icon: 'ScanFace', group: 'face', requiredBackend: ['face'] },
  { id: 'landmarks', label: 'Face Landmarks', icon: 'Grid', group: 'face', requiredBackend: ['facemesh'] },
  { id: 'headpose', label: 'Head Pose', icon: 'Compass', group: 'face', requiredBackend: ['facemesh'] },
  { id: 'eyes', label: 'Eye Tracking', icon: 'Eye', group: 'face', requiredBackend: ['facemesh'] },
  { id: 'blink', label: 'Blink Detection', icon: 'EyeOff', group: 'face', requiredBackend: ['facemesh'] },
  { id: 'mouth', label: 'Mouth Detection', icon: 'Mic', group: 'face', requiredBackend: ['facemesh'] },
  { id: 'objects', label: 'Object Detection', icon: 'Boxes', group: 'yolo', requiredBackend: ['yolo'] },
  { id: 'person', label: 'Person Count', icon: 'Users', group: 'yolo', requiredBackend: ['yolo'] },
  { id: 'phone', label: 'Phone Detection', icon: 'Smartphone', group: 'yolo', requiredBackend: ['yolo'] },
  { id: 'book', label: 'Book Detection', icon: 'BookOpen', group: 'yolo', requiredBackend: ['yolo'] },
  { id: 'temporal', label: 'Temporal Engine', icon: 'Activity', group: 'engine', requiredBackend: ['all'] },
  { id: 'profiler', label: 'Performance Profiler', icon: 'Gauge', group: 'system', requiredBackend: ['all'] },
  { id: 'replay', label: 'Session Replay', icon: 'History', group: 'system', requiredBackend: [] },
  { id: 'logs', label: 'Logs Console', icon: 'Terminal', group: 'system', requiredBackend: [] },
  { id: 'system', label: 'System Info', icon: 'Cpu', group: 'system', requiredBackend: [] },
];

export const MODULE_VALIDATIONS = {
  face: [
    { id: 'face_detected', text: 'Single face detected in frame', test: (ctx) => ctx?.face_detection?.face_count === 1 },
    { id: 'face_centered', text: 'Face positioned near center (0.35 - 0.65)', test: (ctx) => {
      const c = ctx?.face_detection?.face_center;
      return c && c[0] >= 0.35 && c[0] <= 0.65 && c[1] >= 0.35 && c[1] <= 0.65;
    }},
    { id: 'high_confidence', text: 'Face detection confidence >= 0.85', test: (ctx) => (ctx?.face_detection?.face_boxes?.[0]?.confidence || 0) >= 0.85 },
  ],
  landmarks: [
    { id: 'all_landmarks', text: '468 landmarks extracted successfully', test: (ctx) => ctx?.face_landmarks?.landmarks_count === 468 },
    { id: 'nose_detected', text: 'Nose tip coordinates valid', test: (ctx) => !!ctx?.head_pose?.nose_tip },
  ],
  headpose: [
    { id: 'center', text: 'Center orientation (Yaw -10° to 10°)', test: (ctx) => Math.abs(ctx?.head_pose?.angles?.yaw || 0) <= 10 && ctx?.head_pose?.direction === 'center' },
    { id: 'look_left', text: 'Turn head left (Yaw < -10°)', test: (ctx) => (ctx?.head_pose?.angles?.yaw || 0) < -10 || ctx?.head_pose?.direction === 'left' },
    { id: 'look_right', text: 'Turn head right (Yaw > 10°)', test: (ctx) => (ctx?.head_pose?.angles?.yaw || 0) > 10 || ctx?.head_pose?.direction === 'right' },
    { id: 'look_up', text: 'Look up (Pitch > 6° or direction up)', test: (ctx) => (ctx?.head_pose?.angles?.pitch || 0) > 6 || ctx?.head_pose?.direction === 'up' },
    { id: 'look_down', text: 'Look down (Pitch < -6° or direction down)', test: (ctx) => (ctx?.head_pose?.angles?.pitch || 0) < -6 || ctx?.head_pose?.direction === 'down' },
  ],
  eyes: [
    { id: 'eyes_open', text: 'Eyes naturally open (EAR > 0.22)', test: (ctx) => (ctx?.eye_tracking?.avg_ear || 0) >= 0.22 },
    { id: 'left_right_balance', text: 'Left & Right EAR balanced (diff < 0.15)', test: (ctx) => {
      const e = ctx?.eye_tracking;
      return e && Math.abs(e.left_ear - e.right_ear) < 0.15 && e.avg_ear > 0.15;
    }},
  ],
  blink: [
    { id: 'blink_detected', text: 'Blink registered (EAR < 0.20 pulse)', test: (ctx) => ctx?.blink_detection?.is_blinking === true },
    { id: 'open_post_blink', text: 'Eyes reopen normally after blink', test: (ctx) => ctx?.blink_detection?.is_blinking === false && (ctx?.blink_detection?.ear || 0) > 0.22 },
  ],
  mouth: [
    { id: 'mouth_neutral', text: 'Mouth closed / neutral (MAR < 0.35)', test: (ctx) => (ctx?.mouth_detection?.mar || 0) < 0.35 && !ctx?.mouth_detection?.is_talking },
    { id: 'mouth_open', text: 'Mouth open / speaking (MAR >= 0.40)', test: (ctx) => (ctx?.mouth_detection?.mar || 0) >= 0.40 || ctx?.mouth_detection?.is_talking },
  ],
  objects: [
    { id: 'yolo_active', text: 'YOLO model inference responsive', test: (ctx) => ctx?.yolo_objects && !ctx.yolo_objects.error },
    { id: 'object_found', text: 'At least 1 object recognized in scene', test: (ctx) => (ctx?.yolo_objects?.total_objects || 0) > 0 },
  ],
  person: [
    { id: 'single_person', text: 'Single student detected (count = 1)', test: (ctx) => ctx?.person_detection?.count === 1 },
  ],
  phone: [
    { id: 'phone_detected', text: 'Cell phone detected and bounded', test: (ctx) => ctx?.phone_detection?.status === true },
  ],
  book: [
    { id: 'book_detected', text: 'Book detected and bounded', test: (ctx) => ctx?.book_detection?.status === true },
  ],
  temporal: [
    { id: 'temporal_active', text: 'Temporal engine processing frame buffer', test: (ctx) => ctx?.temporal_engine && ctx.temporal_engine.history_length > 0 },
    { id: 'risk_evaluated', text: 'Real-time risk score calculated (0 - 100)', test: (ctx) => typeof ctx?.temporal_engine?.risk_score === 'number' },
  ],
};

/**
 * Main Canvas Overlay Drawer
 */
export function drawCanvasOverlay(ctx, width, height, context, activeTab) {
  if (!ctx || !context || width === 0 || height === 0) return;

  ctx.clearRect(0, 0, width, height);

  // 1. Draw Face Bounding Boxes
  if (['overview', 'face', 'person'].includes(activeTab) && context.face_detection?.face_boxes) {
    context.face_detection.face_boxes.forEach((box, i) => {
      const bx = box.xmin * width;
      const by = box.ymin * height;
      const bw = box.width * width;
      const bh = box.height * height;

      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      // Label tag
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.fillRect(bx, by - 24, Math.max(140, bw * 0.5), 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`Face #${i + 1} (${Math.round(box.confidence * 100)}%)`, bx + 6, by - 7);

      // Center crosshair
      const cx = box.cx * width;
      const cy = box.cy * height;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
      ctx.stroke();
    });
  }

  // 2. Draw 468 Landmarks Sample
  if (['overview', 'landmarks'].includes(activeTab) && context.face_landmarks?.landmarks_sample) {
    ctx.fillStyle = '#38BDF8';
    context.face_landmarks.landmarks_sample.forEach((pt) => {
      const px = pt.x * width;
      const py = pt.y * height;
      ctx.beginPath();
      ctx.arc(px, py, activeTab === 'landmarks' ? 2 : 1.5, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  // 3. Draw Head Pose Vector & 6 Keypoints
  if (['overview', 'headpose'].includes(activeTab) && context.head_pose) {
    const hp = context.head_pose;
    if (hp.keypoints_2d) {
      ctx.fillStyle = '#F59E0B';
      hp.keypoints_2d.forEach((kp) => {
        ctx.beginPath();
        ctx.arc(kp[0], kp[1], 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    if (hp.nose_tip && hp.angles) {
      const nx = hp.nose_tip[0] * width;
      const ny = hp.nose_tip[1] * height;
      const pitch = hp.angles.pitch || 0;
      const yaw = hp.angles.yaw || 0;

      // Project 3D vector arrow
      const vx = nx + yaw * 3.5;
      const vy = ny - pitch * 3.5;

      ctx.strokeStyle = hp.looking_away ? '#EF4444' : '#10B981';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(vx, vy);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = hp.looking_away ? '#EF4444' : '#10B981';
      ctx.beginPath();
      ctx.arc(vx, vy, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // 4. Draw Eye Contours
  if (['overview', 'eyes', 'blink'].includes(activeTab) && context.eye_tracking) {
    const et = context.eye_tracking;
    const drawEye = (pts, label, color) => {
      if (!pts || pts.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = p[0] * width;
        const py = p[1] * height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    };

    const eyeColor = context.blink_detection?.is_blinking ? '#EF4444' : '#6366F1';
    drawEye(et.left_eye_landmarks, 'Left Eye', eyeColor);
    drawEye(et.right_eye_landmarks, 'Right Eye', eyeColor);
  }

  // 5. Draw Mouth Contour
  if (['overview', 'mouth'].includes(activeTab) && context.mouth_detection?.lip_landmarks) {
    const lips = context.mouth_detection.lip_landmarks;
    ctx.strokeStyle = context.mouth_detection.is_talking ? '#EC4899' : '#8B5CF6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    lips.forEach((p, i) => {
      const px = p[0] * width;
      const py = p[1] * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // 6. Draw YOLO Objects (Phone, Book, Person, General)
  if (['overview', 'objects', 'phone', 'book', 'person'].includes(activeTab) && context.yolo_objects?.detections) {
    context.yolo_objects.detections.forEach((obj) => {
      let isTarget = true;
      let color = '#8B5CF6';

      if (activeTab === 'phone') isTarget = obj.class_name === 'cell phone';
      else if (activeTab === 'book') isTarget = obj.class_name === 'book';
      else if (activeTab === 'person') isTarget = obj.class_name === 'person';

      if (!isTarget) return;

      if (obj.class_name === 'cell phone') color = '#EF4444';
      else if (obj.class_name === 'book') color = '#F59E0B';
      else if (obj.class_name === 'person') color = '#3B82F6';

      const bx = obj.bbox.xmin * width;
      const by = obj.bbox.ymin * height;
      const bw = obj.bbox.width * width;
      const bh = obj.bbox.height * height;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = color;
      ctx.fillRect(bx, by - 22, Math.max(120, bw * 0.4), 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${obj.class_name} (${Math.round(obj.confidence * 100)}%)`, bx + 5, by - 6);
    });
  }
}
