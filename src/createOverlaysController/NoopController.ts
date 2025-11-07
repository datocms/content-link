/**
 * Controller interface and no-op implementation for SSR environments.
 */
import type { OverlaysController } from './types.js';

/**
 * Minimal controller used when the runtime executes outside the browser.
 * Keeps the API surface consistent without touching the DOM.
 */
export class NoopController implements OverlaysController {
  private enabled = false;
  private disposed = false;

  enable(): void {
    if (this.disposed) {
      return;
    }
    this.enabled = true;
  }

  disable(): void {
    if (this.disposed) {
      return;
    }
    this.enabled = false;
  }

  toggle(): void {
    if (this.disposed) {
      return;
    }
    this.enabled = !this.enabled;
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
  }

  isEnabled(): boolean {
    return !this.disposed && this.enabled;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  refresh(): void {
    // no-op on the server
  }
}
