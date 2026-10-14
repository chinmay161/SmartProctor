// When the app itself triggers a browser prompt (camera permission, screen-share
// picker, fullscreen), the browser may blur the window, hide the tab, or leave
// fullscreen. Those side effects must not be reported as the student's doing.
// Likewise nothing is reported once the page has started unloading (reload/close).

export const SYSTEM_PROMPT_GRACE_MS = 1500;

// Violation types caused by focus/fullscreen side effects of a browser prompt.
export const PROMPT_SENSITIVE_TYPES = new Set([
  'FULLSCREEN_EXIT',
  'WINDOW_BLUR',
  'TAB_SWITCH',
  'VISIBILITY_CHANGE',
  'WINDOW_RESIZE',
]);

let pendingPrompts = 0;
let lastPromptSettledAt = Number.NEGATIVE_INFINITY;
let unloading = false;

const now = () => performance.now();

/** Run an app-initiated browser prompt; grace lasts while pending and 1.5 s after. */
export async function withSystemPrompt(run) {
  pendingPrompts += 1;
  try {
    return await run();
  } finally {
    pendingPrompts -= 1;
    lastPromptSettledAt = now();
  }
}

export const isSystemPromptGraceActive = () =>
  pendingPrompts > 0 || now() - lastPromptSettledAt < SYSTEM_PROMPT_GRACE_MS;

export const markUnloading = () => {
  unloading = true;
};

export const isUnloading = () => unloading;

/** True when a violation of this type must not be reported right now. */
export const shouldSuppressViolation = (type) =>
  unloading || (PROMPT_SENSITIVE_TYPES.has(type) && isSystemPromptGraceActive());

/** Test helper. */
export const resetSuppressionForTests = () => {
  pendingPrompts = 0;
  lastPromptSettledAt = Number.NEGATIVE_INFINITY;
  unloading = false;
};
