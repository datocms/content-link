/** Public entry point: re-export the APIs consumers rely on. */
export { createController } from './createController/index.js';
export type {
  Controller,
  CreateControllerOptions,
  StampSummary,
  State
} from './createController/types.js';
export { decodeStega, stripStega } from './stega/decode.js';
export type { DecodedInfo } from './stega/types.js';
