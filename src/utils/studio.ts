/**
 * Utility functions for DatoCMS Studio integration.
 */

/**
 * Check if the current context is running inside an iframe.
 */
export function isInIframe(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/**
 * Extract item ID from a DatoCMS edit URL.
 * Format: https://{domain}/editor/item_types/{typeId}/items/{itemId}/edit
 * Item IDs can be numeric strings ("123456") or base64-encoded UUIDs
 */
export function extractItemId(editUrl: string): string | null {
  const match = editUrl.match(/\/items\/([^\/]+)\/edit/);
  return match ? match[1] : null;
}

/**
 * Extract all unique item IDs from a collection of edit URLs.
 */
export function extractItemIds(editUrls: Iterable<string>): string[] {
  const itemIds = new Set<string>();
  for (const url of editUrls) {
    const itemId = extractItemId(url);
    if (itemId) {
      itemIds.add(itemId);
    }
  }
  return Array.from(itemIds);
}
