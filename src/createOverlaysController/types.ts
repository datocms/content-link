/**
 * Public-facing type definitions exposed in the main API.
 * These form the contract between the library and consumers.
 */

export type CreateOverlaysControllerOptions = {
  root?: ParentNode;
  autoEnable?: boolean;
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
