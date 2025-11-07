/** Public entry point: re-export the APIs consumers rely on. */
export { enableDatoAutoClean } from './enableDatoAutoClean/index.js';
export { enableDatoVisualEditing } from './enableDatoVisualEditing/index.js';
export type {
  EnableDatoVisualEditingOptions,
  StampSummary,
  State
} from './enableDatoVisualEditing/types.js';
export { decodeStega, stripStega } from './stega/decode.js';
export type { DecodedInfo } from './stega/types.js';
