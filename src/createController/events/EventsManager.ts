/**
 * Manages CustomEvent dispatching for lifecycle changes.
 * Extracted from BrowserController to maintain single responsibility.
 * Exposes high-level semantic methods for each event type.
 */
import type { StampSummary } from '../types.js';
import { EVENT_STAMPED } from './constants.js';
import type { EventsManagerOptions } from './types.js';

export class EventsManager {
  private readonly doc: Document;

  constructor(options: EventsManagerOptions) {
    this.doc = options.doc;
  }

  /** Emit the stamped event after applying stamps */
  emitStamped(summary: StampSummary): void {
    this.dispatch(EVENT_STAMPED, summary);
  }

  /**
   * Internal dispatch method - not exposed in the public interface.
   * Dispatches a CustomEvent when possible so non-JS integrations can observe
   * lifecycle changes.
   */
  private dispatch<T>(type: string, payload: T): void {
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
