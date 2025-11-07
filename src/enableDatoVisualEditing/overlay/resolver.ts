/**
 * Resolve which element should receive the overlay highlight when the pointer
 * hovers over the page. Simple wrapper, but kept isolated for testability.
 */
import { AUTOMATIC_STAMP_ATTRIBUTE, MANUAL_STAMP_ATTRIBUTE } from '../stamp/constants.js';
import type { Target } from './types.js';

/**
 * Walk up from the hovered element until we hit something stamped with
 * `data-datocms-edit-url`. Returns both the element and the URL to open.
 */
export function findEditableTarget(from: Element | null): Target | null {
  if (!from) {
    return null;
  }

  const el = from.closest<HTMLElement>(
    `[${MANUAL_STAMP_ATTRIBUTE}], [${AUTOMATIC_STAMP_ATTRIBUTE}]`
  );
  if (!el) {
    return null;
  }

  const url = el.getAttribute(MANUAL_STAMP_ATTRIBUTE) || el.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE);
  if (!url) {
    return null;
  }

  return { el, editUrl: url };
}
