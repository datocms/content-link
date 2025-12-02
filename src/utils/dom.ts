import { type Options, compute as computeScrollIntoView } from 'compute-scroll-into-view';

export function resolveDocument(root: ParentNode): Document {
  const docCtor = typeof Document !== 'undefined' ? Document : undefined;
  const globalDoc = typeof document !== 'undefined' ? document : undefined;

  if (docCtor && root instanceof docCtor) {
    return root as Document;
  }

  const finalDoc = root.ownerDocument ?? globalDoc ?? null;

  if (!finalDoc) {
    throw new Error('Unable to resolve document');
  }

  return finalDoc;
}

export function inBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function inIframe() {
  return typeof window !== 'undefined' && window.parent !== window;
}

export function toCompletePath(urlString: string) {
  const url = new URL(urlString, 'http://example.com');
  return url.pathname + url.search + url.hash;
}

export function isMousePointerEvent(event: Event): event is PointerEvent {
  if (typeof PointerEvent !== 'undefined') {
    return event instanceof PointerEvent;
  }
  return (
    typeof (event as PointerEvent).pointerType === 'string' &&
    (event as PointerEvent).pointerType === 'mouse'
  );
}

export function isMouseEvent(event: Event): event is MouseEvent {
  if (typeof MouseEvent !== 'undefined') {
    return event instanceof MouseEvent;
  }
  return typeof (event as MouseEvent).button === 'number';
}

export function isKeyboardEvent(event: Event): event is KeyboardEvent {
  if (typeof KeyboardEvent !== 'undefined') {
    return event instanceof KeyboardEvent;
  }
  return typeof (event as KeyboardEvent).key === 'string';
}

export function getDocumentWindow(document: Document) {
  return document.defaultView ?? (typeof window !== 'undefined' ? window : null);
}

export function getResizeObserverCtor(window: Window | null): typeof ResizeObserver | undefined {
  if (window && 'ResizeObserver' in window) {
    // biome-ignore lint/suspicious/noExplicitAny: Window type doesn't include ResizeObserver, but it exists at runtime
    return (window as any).ResizeObserver;
  } else if (typeof ResizeObserver !== 'undefined') {
    return ResizeObserver;
  }
}

/** Compute the bounding box for the target element, ignoring zero-size nodes. */
export function measure(
  el: Element
): { top: number; left: number; width: number; height: number } | null {
  if (typeof el.getBoundingClientRect !== 'function') {
    return null;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ms <= 0) {
      // Still respect immediate abort
      if (signal.aborted) {
        reject(new Error('Animation cancelled'));
      } else {
        resolve();
      }
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('Animation cancelled'));
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort);
  });
}

export async function waitTwoRafs() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    })
  );
}

export function inViewport(element: Element) {
  const document = resolveDocument(element);
  const rect = element.getBoundingClientRect();
  const docWindow = getDocumentWindow(document);

  if (!docWindow) {
    return false;
  }

  const viewportHeight = docWindow.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = docWindow.innerWidth || document.documentElement.clientWidth;

  return (
    rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0
  );
}

export function getScrollDistance(el: Element, options: Options) {
  const actions = computeScrollIntoView(el, options);

  let distance = 0;

  for (const action of actions) {
    const el = action.el as HTMLElement;
    const dy = Math.abs(action.top - el.scrollTop);
    const dx = Math.abs(action.left - el.scrollLeft);
    distance += dx + dy;
  }

  return distance;
}

/**
 * Scrolls to the nearest target element if none of the targets are currently visible.
 * Finds the target that requires the least scrolling distance and smoothly scrolls to it.
 *
 * @param targets - Array of elements to consider for scrolling
 * @param signal - AbortSignal to cancel the operation
 * @returns Promise that resolves when scrolling is complete or if no scrolling is needed
 */
export async function maybeScrollToNearestTarget(
  targets: HTMLElement[],
  signal: AbortSignal
): Promise<void> {
  const someTargetIsVisible = targets.some(inViewport);

  if (someTargetIsVisible) {
    return;
  }

  let best: HTMLElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const dist = getScrollDistance(target, {
      scrollMode: 'if-needed',
      block: 'center',
      inline: 'nearest'
    });

    if (dist < bestDistance && isElementVisible(target)) {
      bestDistance = dist;
      best = target;
    }
  }

  if (!best) {
    return;
  }

  best.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await abortableSleep(500, signal);
}

export function isElementVisible(el: HTMLElement | null): boolean {
  if (!el) return false;

  const style = window.getComputedStyle(el);

  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  if (el.offsetWidth === 0 && el.offsetHeight === 0) {
    return false;
  }

  const parent = el.parentElement;
  if (parent) {
    return isElementVisible(parent);
  }

  return true;
}
