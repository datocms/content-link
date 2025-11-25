/**
 * Internal types for the DOM stamping manager.
 */
import type { StampSummary } from '../types.js';

/**
 * Configuration options for DomStampingManager.
 */
export type DomStampingManagerOptions = {
  /** The root node to observe for DOM mutations */
  root: ParentNode;
  /** The document associated with the root */
  doc: Document;
  /** Callback invoked after stamps are applied */
  onStamped: (summary: StampSummary) => void;
};

/**
 * Internal interface for the DOM stamping manager.
 * This is not exported from the public API.
 */
export interface DomStampingManager {
  /** Start observation and perform initial stamp */
  start(): void;
  /** Stop observation and clear stamps */
  stop(): void;
  /** Manual stamp trigger (for testing or forced updates) */
  /** Whether the manager is currently active */
  isActive(): boolean;
}
