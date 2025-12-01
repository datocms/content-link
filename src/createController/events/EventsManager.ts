/**
 * Manages CustomEvent dispatching for lifecycle changes.
 * Extracted from BrowserController to maintain single responsibility.
 * Exposes high-level semantic methods for each event type.
 */
import type { StampSummary } from '../types.js';
import { EVENT_CLICK_TO_EDIT_TOGGLE, EVENT_STAMPED } from './constants.js';
import type { EventsManagerOptions } from './types.js';

export class EventsManager {
  private readonly doc: Document;

  constructor(options: EventsManagerOptions) {
    this.doc = options.doc;
  }

  emitStamped(summary: StampSummary) {
    this.dispatch(EVENT_STAMPED, summary);
  }

  emitClickToEditToggle(enabled: boolean) {
    this.dispatch(EVENT_CLICK_TO_EDIT_TOGGLE, enabled);
  }

  private dispatch<T>(type: string, payload: T) {
    const CustomEventCtor =
      this.doc.defaultView?.CustomEvent ??
      (typeof CustomEvent !== 'undefined' ? CustomEvent : undefined);
    if (!CustomEventCtor) {
      return;
    }

    try {
      const event = new CustomEventCtor(type, { detail: payload });
      this.doc.dispatchEvent(event);
    } catch {
      // Ignore dispatch failures (e.g. CustomEvent polyfill not available)
    }
  }
}
