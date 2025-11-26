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
