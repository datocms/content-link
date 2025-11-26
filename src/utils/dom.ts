/**
 * Resolve the document associated with the provided root node. Falls back to
 * the global document when available and returns null in non-DOM environments.
 */
export function resolveDocument(root: ParentNode): Document | null {
  const docCtor = typeof Document !== 'undefined' ? Document : undefined;
  const globalDoc = typeof document !== 'undefined' ? document : undefined;

  if (docCtor && root instanceof docCtor) {
    return root as Document;
  }

  return root.ownerDocument ?? globalDoc ?? null;
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
