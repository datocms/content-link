/**
 * Controller interface and no-op implementation for SSR environments.
 */
import type { Controller } from './types.js';

/**
 * Minimal controller used when the runtime executes outside the browser.
 * Keeps the API surface consistent without touching the DOM.
 */
export function createNoopController(autoEnable: boolean): Controller {
  let enabled = autoEnable;
  let disposed = false;

  return {
    enable() {
      if (disposed) {
        return;
      }
      enabled = true;
    },
    disable() {
      if (disposed) {
        return;
      }
      enabled = false;
    },
    toggle() {
      if (disposed) {
        return;
      }
      enabled = !enabled;
    },
    dispose() {
      disposed = true;
      enabled = false;
    },
    isEnabled() {
      return !disposed && enabled;
    },
    isDisposed() {
      return disposed;
    },
    refresh() {
      // no-op on the server
    }
  };
}
