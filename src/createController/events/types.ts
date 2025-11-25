/**
 * Internal types for the events manager.
 */
import type { StampSummary } from '../types.js';

/**
 * Configuration options for EventsManager.
 */
export type EventsManagerOptions = {
  /** The document to dispatch events on */
  doc: Document;
};

/**
 * Internal interface for the events manager.
 * This is not exported from the public API.
 */
export interface EventsManager {
  /** Emit the stamped event after applying stamps */
  emitStamped(summary: StampSummary): void;
}
