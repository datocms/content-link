/**
 * Shared ResizeObserver singleton to optimize performance when observing
 * many elements. Instead of creating one ResizeObserver per element,
 * all observations share a single observer instance per window.
 */

type ResizeCallback = () => void;

function getResizeObserverCtor(window: Window | null): typeof ResizeObserver | undefined {
  if (window && 'ResizeObserver' in window) {
    // biome-ignore lint/suspicious/noExplicitAny: Window type doesn't include ResizeObserver, but it exists at runtime
    return (window as any).ResizeObserver;
  } else if (typeof ResizeObserver !== 'undefined') {
    return ResizeObserver;
  }
}

class SharedResizeObserver {
  private observer: ResizeObserver | null = null;
  private callbacks = new WeakMap<Element, Set<ResizeCallback>>();

  constructor(private window: Window) {
    const ResizeObserverCtor = getResizeObserverCtor(this.window);
    if (ResizeObserverCtor) {
      this.observer = new ResizeObserverCtor((entries: ResizeObserverEntry[]) => {
        for (const entry of entries) {
          const callbacks = this.callbacks.get(entry.target);
          if (callbacks) {
            for (const callback of callbacks) {
              callback();
            }
          }
        }
      });
    }
  }

  observe(element: Element, callback: ResizeCallback): () => void {
    if (!this.observer) {
      return () => {}; // no-op if ResizeObserver not available
    }

    let callbacks = this.callbacks.get(element);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(element, callbacks);
      this.observer.observe(element);
    }

    callbacks.add(callback);

    // Return unobserve function
    return () => {
      const callbacks = this.callbacks.get(element);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.callbacks.delete(element);
          this.observer?.unobserve(element);
        }
      }
    };
  }
}

// Cache of shared observers per window
const observerCache = new WeakMap<Window, SharedResizeObserver>();

export function getSharedResizeObserver(window: Window | null): SharedResizeObserver | null {
  if (!window) {
    return null;
  }

  let observer = observerCache.get(window);
  if (!observer) {
    observer = new SharedResizeObserver(window);
    observerCache.set(window, observer);
  }
  return observer;
}
