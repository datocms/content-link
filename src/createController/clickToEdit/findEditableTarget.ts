/**
 * Resolve which element should receive the overlay highlight when the pointer
 * hovers over the page. Simple wrapper, but kept isolated for testability.
 */
import { AUTOMATIC_STAMP_ATTRIBUTE, MANUAL_STAMP_ATTRIBUTE } from '../domStamping/constants.js';

export type EditableTarget = {
  element: Element;
  editUrl: string;
};

export function findEditableTarget(from: EventTarget | Element | null): EditableTarget | null {
  if (!from || !(from instanceof Element)) {
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

  return { element: el, editUrl: url };
}
