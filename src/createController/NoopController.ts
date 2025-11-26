/**
 * Controller interface and no-op implementation for SSR environments.
 */
import type { Controller } from './types.js';

/**
 * Minimal controller used when the runtime executes outside the browser.
 * Keeps the API surface consistent without touching the DOM.
 */
export class NoopController implements Controller {
  private disposed = false;

  dispose(): void {
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  setCurrentPath(): void {
    // no-op on the server
  }

  enableClickToEdit(): void {
    // no-op on the server
  }

  disableClickToEdit(): void {
    // no-op on the server
  }

  isClickToEditEnabled(): boolean {
    return false;
  }
}
