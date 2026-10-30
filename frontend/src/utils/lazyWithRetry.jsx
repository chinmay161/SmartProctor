import React, { lazy } from 'react';

/**
 * Enhanced lazy with retry:
 * - On /exam-portal route: never show reload prompt; retries silently up to 3 times;
 *   if it still fails, renders a non-blocking notice without interrupting the exam.
 * - On other routes: catches chunk failure after retrying and renders a
 *   user-facing "New version available" card with an explicit "Reload Page" button
 *   (never auto-reloads).
 */
export function lazyWithRetry(componentImport, componentName = 'Component') {
  return lazy(async () => {
    const isExamRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/exam-portal');
    const maxAttempts = isExamRoute ? 3 : 2;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        return await componentImport();
      } catch (error) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          if (isExamRoute) {
            console.error(`[lazyWithRetry] Failed to load ${componentName} in exam-portal after ${maxAttempts} attempts:`, error);
            // Non-blocking fallback for exam route — no reload prompt!
            return {
              default: () => (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 my-2 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground flex items-center gap-2"
                >
                  <span>Component temporarily unavailable. Your exam progress and answers remain safely saved.</span>
                </div>
              ),
            };
          }

          // Non-exam routes: show explicit Reload card
          return {
            default: () => (
              <div className="min-h-[50vh] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-lg">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">New Version Available</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    An update was deployed. Please reload the page to load the latest application files.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition cursor-pointer"
                  >
                    Reload Page
                  </button>
                </div>
              </div>
            ),
          };
        }
        // Brief pause before retry
        await new Promise((resolve) => setTimeout(resolve, 800 * attempts));
      }
    }
  });
}

export default lazyWithRetry;
