/**
 * Types used by the overlay system.
 */

export type Target = {
  el: Element;
  editUrl: string;
};

export type Listener = {
  target: EventTarget;
  type: string;
  handler: EventListenerOrEventListenerObject;
  options?: AddEventListenerOptions | boolean;
};
