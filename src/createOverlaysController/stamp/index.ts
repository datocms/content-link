import { decodeStega, splitStega } from '../../stega/decode.js';
import { resolveDocument } from '../../utils/dom.js';
import type { StampSummary } from '../types.js';
import { AUTOMATIC_STAMP_ATTRIBUTE, EDIT_GROUP_ATTRIBUTE } from './constants.js';

/**
 * Traverse `root`, decode stega-encoded data, stamp DOM elements with edit URL
 * attributes, and return bookkeeping information that the controller can aggregate.
 */
export function addStamps(root: ParentNode): StampSummary {
  const doc = resolveDocument(root);

  if (!doc) {
    return {
      appliedStamps: new Map(),
      scope: root
    };
  }

  // Track elements stamped in this pass to detect collisions within the same pass
  const appliedStamps = new Map<Element, string>();

  // First pass: walk text nodes and process stega-encoded content
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node: Node | null = walker.nextNode();
  while (node) {
    if (!(node instanceof Text)) {
      node = walker.nextNode();
      continue;
    }
    const value = node.nodeValue ?? '';
    const parent = node.parentElement;

    const cleanValue = stampTargetAndReturnClean(
      value,
      parent ? resolveTarget(parent) : null,
      appliedStamps
    );

    if (cleanValue !== undefined) {
      node.nodeValue = cleanValue;
    }

    node = walker.nextNode();
  }

  // Second pass: inspect image alts, since they are not part of the text walker.
  for (const img of root.querySelectorAll<HTMLImageElement>('img[alt]')) {
    const alt = img.getAttribute('alt');

    const cleanAlt = stampTargetAndReturnClean(
      alt,
      preferWrapperIfZeroSize(img) ?? resolveTarget(img),
      appliedStamps
    );

    if (cleanAlt !== undefined) {
      img.setAttribute('alt', cleanAlt);
    }
  }

  const summary: StampSummary = {
    appliedStamps: appliedStamps,
    scope: root
  };

  return summary;
}

/**
 * Process stega-encoded values, decode them, and stamp the target element.
 * This handles the complete flow: split, decode, resolve target, check collisions, and stamp.
 */
function stampTargetAndReturnClean(
  value: string | null,
  target: Element | null,
  appliedStamps: Map<Element, string>
): string | undefined {
  if (!value || !target) {
    return;
  }

  const split = splitStega(value);
  if (!split.encoded) {
    return undefined;
  }

  const decoded = decodeStega(value, split);
  if (!decoded) {
    return undefined;
  }

  // Check for collision within this pass
  const existingStamp = appliedStamps.get(target);

  if (existingStamp && existingStamp !== decoded.href) {
    warnCollision(target, existingStamp, decoded.href);
  }

  // Stamp the attribute if it changed
  const existingEditUrl = target.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE);

  if (existingEditUrl !== decoded.href) {
    target.setAttribute(AUTOMATIC_STAMP_ATTRIBUTE, decoded.href);
    appliedStamps.set(target, decoded.href);
  }

  return split.cleaned;
}

// Log when two stega-encoded payloads map to the same element in a single pass, which would break deep linking.
function warnCollision(el: Element, originalUrl: string, nextUrl: string): void {
  const message = `[datocms-visual-editing] Multiple stega-encoded payloads resolved to the same DOM element. Previous URL: ${originalUrl}. Incoming URL: ${nextUrl}. Wrap each encoded block in its own element (for example by adding data-datocms-edit-target).`;

  console.warn(message, el);
}

// If the site provided a wrapper via data-datocms-edit-target we stamp that instead.
function resolveTarget(start: Element): Element {
  const wrapper = start.closest<HTMLElement>(`[${EDIT_GROUP_ATTRIBUTE}]`);
  return wrapper ?? start;
}

// Invisible images often live inside wrappers that have layout; prefer those.
function preferWrapperIfZeroSize(img: HTMLImageElement): Element | null {
  if (typeof img.getBoundingClientRect !== 'function') {
    return null;
  }
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    const wrapper = img.closest<HTMLElement>(`[${EDIT_GROUP_ATTRIBUTE}]`);
    if (wrapper) {
      return wrapper;
    }
  }
  return null;
}

/**
 * Remove all generated stamps and debug payloads inside `root`. Used when
 * disabling the controller or running in environments where overlays are off.
 */
export function clearStamps(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLElement>(`[${AUTOMATIC_STAMP_ATTRIBUTE}]`);
  for (const el of nodes) {
    el.removeAttribute(AUTOMATIC_STAMP_ATTRIBUTE);
  }
}
