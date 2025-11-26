/**
 * Types used by the click-to-edit system.
 */
import type { ClickToEditStyle } from '../types.js';

export type Target = {
  el: Element;
  editUrl: string;
};

/**
 * Configuration options for ClickToEditManager.
 */
export type ClickToEditManagerOptions = {
  /** The document to attach listeners to */
  doc: Document;
  /** Optional style customization */
  style?: ClickToEditStyle;
  /** Callback invoked when user clicks to edit */
  onEditClick: (editUrl: string) => void;
};

/**
 * Internal interface for the click-to-edit manager.
 * This is not exported from the public API.
 */
export interface ClickToEditManager {
  /** Initialize overlay and attach all listeners */
  start(): void;
  /** Clean up overlay and remove all listeners */
  stop(): void;
  /** Whether the manager is currently active */
  isActive(): boolean;
}
