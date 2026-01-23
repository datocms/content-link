/**
 * Shared DOM attribute names used by the visual editing runtime.
 * Keeping them centralized avoids typos and makes it clear which stamps the SDK
 * writes to the page when identifying editable regions.
 */
export const AUTOMATIC_STAMP_ATTRIBUTE = 'data-datocms-stega';
export const MANUAL_STAMP_ATTRIBUTE = 'data-datocms-content-link-url';
export const GROUP_ATTRIBUTE = 'data-datocms-content-link-group';
export const GROUP_BOUNDARY_ATTRIBUTE = 'data-datocms-content-link-boundary';
export const SOURCE_STAMP_ATTRIBUTE = 'data-datocms-content-link-source';

export const STAMPED_ELEMENTS_SELECTOR = `[${MANUAL_STAMP_ATTRIBUTE}], [${AUTOMATIC_STAMP_ATTRIBUTE}]`;
