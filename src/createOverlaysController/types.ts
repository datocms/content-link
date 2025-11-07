/**
 * Public-facing type definitions exposed in the main API.
 * These form the contract between the library and consumers.
 */

/**
 * Style options for customizing the appearance of the highlight overlay.
 * All properties are optional and will fall back to default values if not provided.
 */
export type OverlayStyle = {
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

export type CreateOverlaysControllerOptions = {
  root?: ParentNode;
  /** Style options for customizing the highlight overlay appearance */
  overlayStyle?: OverlayStyle;
};

export type StampSummary = {
  scope: ParentNode;
  appliedStamps: Map<Element, string>;
};

export type OverlaysController = {
  enable(): void;
  disable(): void;
  toggle(): void;
  dispose(): void;
  isEnabled(): boolean;
  isDisposed(): boolean;
  refresh(root?: ParentNode): void;
};

export type State = {
  enabled: boolean;
  disposed: boolean;
};
