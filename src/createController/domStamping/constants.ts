/**
 * Shared DOM attribute names used by the visual editing runtime.
 * Keeping them centralized avoids typos and makes it clear which stamps the SDK
 * writes to the page when identifying editable regions.
 */
export const AUTOMATIC_TARGET_STAMP_ATTRIBUTE =
  'data-datocms-auto-content-link-url';
export const AUTOMATIC_STEGA_STAMP_ATTRIBUTE = 'data-datocms-contains-stega';
export const MANUAL_TARGET_STAMP_ATTRIBUTE = 'data-datocms-content-link-url';
export const GROUP_ATTRIBUTE = 'data-datocms-content-link-group';
export const GROUP_BOUNDARY_ATTRIBUTE = 'data-datocms-content-link-boundary';
export const SOURCE_STAMP_ATTRIBUTE = 'data-datocms-content-link-source';

export const STAMPED_ELEMENTS_SELECTOR = `[${MANUAL_TARGET_STAMP_ATTRIBUTE}], [${AUTOMATIC_TARGET_STAMP_ATTRIBUTE}]`;
