// Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
/**
 * Takes a device hardware and browser environment snapshot for telemetry.
 * Numbers and short strings only: NO audio, NO images, NO tokens, NO emails, NO answer text.
 */
export function getDeviceSnapshot(delegates = null) {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const win = typeof window !== 'undefined' ? window : {};
    const scr = win.screen || {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

    return {
      user_agent: (nav.userAgent || '').slice(0, 256),
      platform: (nav.platform || '').slice(0, 64),
      hardware_concurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
      device_memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      screen_width: typeof scr.width === 'number' ? scr.width : null,
      screen_height: typeof scr.height === 'number' ? scr.height : null,
      device_pixel_ratio: typeof win.devicePixelRatio === 'number' ? Math.round(win.devicePixelRatio * 100) / 100 : null,
      is_extended: typeof scr.isExtended === 'boolean' ? scr.isExtended : null,
      effective_type: conn?.effectiveType ? String(conn.effectiveType).slice(0, 16) : null,
      face_delegate: delegates?.face ? String(delegates.face).slice(0, 16) : null,
      object_delegate: delegates?.objects ? String(delegates.objects).slice(0, 16) : null,
    };
  } catch {
    return {};
  }
}
