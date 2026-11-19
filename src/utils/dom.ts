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

export function isEditableElementFocused(document: Document): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) {
    return false;
  }
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return active.isContentEditable;
}

/**
 * A cache for one batch of layout reads.
 * Use one cache for each batch. Do not keep it after the batch, because the
 * layout can change.
 */
export type LayoutReadCache = {
  /** Tells if an element and all its ancestors are visible. */
  chainVisible: Map<Element, boolean>;
  /** The z-index of the outermost ancestor that has a numeric z-index. */
  stackingZIndex: Map<Element, number | null>;
};

export function createLayoutReadCache(): LayoutReadCache {
  return { chainVisible: new Map(), stackingZIndex: new Map() };
}

/**
 * Compute the bounding box for the target element, ignoring zero-size or hidden nodes.
 * This function only reads the layout. It also ignores elements that are fully
 * out of the viewport, because an overlay for them is not visible.
 */
export function measure(
  el: Element,
  cache?: LayoutReadCache
): { top: number; left: number; width: number; height: number } | null {
  if (typeof el.getBoundingClientRect !== 'function') {
    return null;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }
  if (!rectIntersectsViewport(el, rect)) {
    return null;
  }
  if (!isElementVisible(el as HTMLElement, cache)) {
    return null;
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

function rectIntersectsViewport(el: Element, rect: DOMRect): boolean {
  const doc = el.ownerDocument;
  const docWindow = doc?.defaultView;

  if (!doc || !docWindow) {
    return true;
  }

  const viewportHeight = docWindow.innerHeight || doc.documentElement.clientHeight;
  const viewportWidth = docWindow.innerWidth || doc.documentElement.clientWidth;

  // If the viewport size is not known, do not ignore the element.
  if (!viewportHeight || !viewportWidth) {
    return true;
  }

  return (
    rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0
  );
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

  await waitUntilScrolledToTarget(best, signal);
}

export function isElementVisible(el: HTMLElement | null, cache?: LayoutReadCache): boolean {
  if (!el) return false;

  if (el.offsetWidth === 0 && el.offsetHeight === 0) {
    return false;
  }

  return isChainVisible(el, cache);
}

/** Tells if the element and all its ancestors have visible styles. */
function isChainVisible(el: HTMLElement | null, cache?: LayoutReadCache): boolean {
  if (!el) return true;

  const cached = cache?.chainVisible.get(el);
  if (cached !== undefined) {
    return cached;
  }

  const style = window.getComputedStyle(el);

  const visible =
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    isChainVisible(el.parentElement, cache);

  cache?.chainVisible.set(el, visible);

  return visible;
}

async function waitUntilScrolledToTarget(target: HTMLElement, signal: AbortSignal) {
  const document = resolveDocument(target);
  const window = getDocumentWindow(document);

  if (!window) {
    await abortableSleep(500, signal);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    let rafId: number;

    const check = () => {
      if (signal.aborted) {
        cancelAnimationFrame(rafId);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const distance = getScrollDistance(target, {
        scrollMode: 'if-needed',
        block: 'center',
        inline: 'nearest'
      });

      // When distance is basically zero, scrolling is done.
      if (Math.abs(distance) < 1) {
        resolve();
        return;
      }

      rafId = requestAnimationFrame(check);
    };

    rafId = requestAnimationFrame(check);
  });

  await abortableSleep(100, signal);
}
