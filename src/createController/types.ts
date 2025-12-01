/**
 * Public-facing type definitions exposed in the main API.
 * These form the contract between the library and consumers.
 */

export type CreateControllerOptions = {
  root?: ParentNode;
  /** Callback invoked when the Web Previews plugin requests navigation to a different URL */
  onNavigateTo?: (path: string) => void;
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
