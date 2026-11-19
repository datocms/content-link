/**
 * Shared scroll/resize event coordinator to optimize performance when
 * many elements need to react to scroll/resize events. Instead of each
 * instance adding its own event listeners, all instances share a single
 * set of listeners per document.
 */

import { type LayoutReadCache, createLayoutReadCache, getDocumentWindow } from './dom.js';
import { rafThrottle } from './rafThrottle.js';

/**
 * A callback reads the layout and returns a function that writes the styles.
 * The coordinator calls all the callbacks first, then all the write functions.
 * Thus the browser computes the layout one time for each frame.
 */
type Callback = (cache: LayoutReadCache) => () => void;

class ScrollResizeCoordinator {
  private callbacks = new Set<Callback>();
  private running = false;
  private rafHandler = rafThrottle(() => {
    // Call all registered callbacks (snapshot to avoid mutation during iteration)
    const cbs = Array.from(this.callbacks);
    const cache = createLayoutReadCache();
    const writes: Array<() => void> = [];

    for (const cb of cbs) {
      try {
        writes.push(cb(cache));
      } catch (err) {
        // Swallow errors to keep other callbacks alive
      }
    }

    for (const write of writes) {
      try {
        write();
      } catch {
        // Swallow errors to keep other callbacks alive
      }
    }
  });

  constructor(private doc: Document) {}

  private startIfNeeded() {
    if (this.running) return;
    const win = getDocumentWindow(this.doc);

    // Single scroll listener on window; listen on document as fallback
    if (win) {
      win.addEventListener('scroll', this.onEvent, {
        passive: true,
        capture: true
      });
      win.addEventListener('resize', this.onEvent, {
        passive: true,
        capture: true
      });
    }
    // Some environments may fire scroll on document (e.g. non-window scrolling element)
    this.doc.addEventListener('scroll', this.onEvent, {
      passive: true,
      capture: true
    });

    this.running = true;
  }

  private stopIfIdle() {
    if (!this.running) return;
    if (this.callbacks.size > 0) return;

    const win = getDocumentWindow(this.doc);
    if (win) {
      win.removeEventListener('scroll', this.onEvent);
      win.removeEventListener('resize', this.onEvent);
    }
    this.doc.removeEventListener('scroll', this.onEvent);
    this.running = false;
    this.rafHandler.cancel();
  }

  private onEvent = () => {
    // Schedule one update per rAF for all callbacks
    this.rafHandler();
  };

  subscribe(cb: Callback): () => void {
    this.callbacks.add(cb);
    this.startIfNeeded();
    return () => {
      this.callbacks.delete(cb);
      this.stopIfIdle();
    };
  }
}

// WeakMap per document to avoid cross-document/global leaks
const coordinatorCache = new WeakMap<Document, ScrollResizeCoordinator>();

export function getScrollResizeCoordinator(doc: Document): ScrollResizeCoordinator {
  let coordinator = coordinatorCache.get(doc);
  if (!coordinator) {
    coordinator = new ScrollResizeCoordinator(doc);
    coordinatorCache.set(doc, coordinator);
  }
  return coordinator;
}
