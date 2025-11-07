/** Public entry point: re-export the APIs consumers rely on. */
export { createOverlaysController } from './createOverlaysController/index.js';
export type {
  CreateOverlaysControllerOptions,
  OverlaysController,
  StampSummary,
  State
} from './createOverlaysController/types.js';
export { decodeStega, stripStega } from './stega/decode.js';
export type { DecodedInfo } from './stega/types.js';
