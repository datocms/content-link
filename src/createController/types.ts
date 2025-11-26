/**
 * Public-facing type definitions exposed in the main API.
 * These form the contract between the library and consumers.
 */

/**
 * Style options for customizing the appearance of the click-to-edit highlight.
 * All properties are optional and will fall back to default values if not provided.
 */
export type ClickToEditStyle = {
  /** CSS border color (default: '#ff7751') */
  borderColor?: string;
  /** CSS border width (default: '2px') */
  borderWidth?: string;
  /** CSS border radius (default: '8px') */
  borderRadius?: string;
  /** CSS background color with opacity (default: 'rgba(255, 119, 81, 0.12)') */
  backgroundColor?: string;
  /** Padding around the highlighted element in pixels (default: 8) */
  padding?: number;
};

export type CreateClickToEditControllerOptions = {
  root?: ParentNode;
  /** Style options for customizing the click-to-edit highlight appearance */
  clickToEditStyle?: ClickToEditStyle;
  /** Callback invoked when the Studio requests navigation to a different URL */
  onNavigateTo?: (url: string) => void;
};

export type StampSummary = {
  scope: ParentNode;
  appliedStamps: Map<Element, string>;
};

export type Controller = {
  dispose(): void;
  isDisposed(): boolean;
  /** Notify the Studio of the current URL (for client-side routing) */
  setCurrentUrl(url: string): void;
  /** Enable click-to-edit functionality */
  enableClickToEdit(): void;
  /** Disable click-to-edit functionality */
  disableClickToEdit(): void;
  /** Whether click-to-edit is currently enabled */
  isClickToEditEnabled(): boolean;
};

export type State = {
  enabled: boolean;
  disposed: boolean;
};
