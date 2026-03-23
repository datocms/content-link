/**
 * Public-facing type definitions exposed in the main API.
 * These form the contract between the library and consumers.
 */

export type CreateControllerOptions = {
  root?: ParentNode;
  /** Callback invoked when the Web Previews plugin requests navigation to a different URL */
  onNavigateTo?: (path: string) => void;
  /** Hue (0–359) of the overlay accent color. Default: 17 (orange). */
  hue?: number;
  /**
   * Whether to strip stega-encoded invisible characters from text content after stamping.
   * Default: false (preserves stega encoding in the DOM)
   *
   * When false (default):
   * - Stega encoding remains in the DOM (invisible to users)
   * - Controller can be disposed and recreated on the same page
   * - Content source of truth is preserved
   *
   * When true:
   * - Stega encoding is permanently removed from text nodes
   * - Text content becomes clean but controller cannot be recreated
   * - Useful if you need clean textContent for programmatic access
   */
  stripStega?: boolean;
};

export type StampSummary = {
  scope: ParentNode;
  appliedStamps: Map<Element, string>;
};

export type Controller = {
  dispose(): void;
  isDisposed(): boolean;
  /** Notify the Web Previews plugin of the current URL (for client-side routing) */
  setCurrentPath(url: string): void;
  /** Enable click-to-edit functionality */
  enableClickToEdit(flashAll?: { scrollToNearestTarget: boolean }): void;
  /** Disable click-to-edit functionality */
  disableClickToEdit(): void;
  /** Whether click-to-edit is currently enabled */
  isClickToEditEnabled(): boolean;
  /** Briefly highlight all editable elements with an animated effect */
  flashAll(scrollToNearestTarget?: boolean): void;
};

export type State = {
  enabled: boolean;
  disposed: boolean;
};
