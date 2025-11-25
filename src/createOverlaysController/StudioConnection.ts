/**
 * Manages bidirectional communication with the DatoCMS Studio via Penpal.
 * Handles connection lifecycle, message passing, and graceful fallback.
 */

import { type AsyncMethodReturns, type Connection, connectToParent } from 'penpal';
import { extractItemId, isInIframe } from '../utils/studio.js';

/**
 * Methods that the Studio exposes to the website (Child to Parent).
 */
type StudioParentMethods = {
  setPageTitle(payload: { title: string }): Promise<void>;
  setPageItems(payload: { itemIds: string[] }): Promise<void>;
  setCurrentUrl(payload: { url: string }): Promise<void>;
  openItem(payload: { itemId: string }): Promise<void>;
  setOverlaysEnabled(payload: { enabled: boolean }): Promise<void>;
};

/**
 * Methods that the website exposes to the Studio (Parent to Child).
 */
type StudioChildMethods = {
  navigateTo(payload: { url: string }): void;
  setOverlaysEnabled(payload: { enabled: boolean }): void;
  highlightItem(payload: { itemId: string }): void;
  clearHighlight(): void;
};

/**
 * Callbacks that the website provides to handle Studio commands.
 */
export type StudioCallbacks = {
  onNavigateTo?: (url: string) => void;
  onSetOverlaysEnabled?: (enabled: boolean) => void;
  onHighlightItem?: (itemId: string) => void;
  onClearHighlight?: () => void;
};

/**
 * Public interface for interacting with the Studio connection.
 */
export type StudioConnection = {
  /** Whether we're successfully connected to the Studio */
  isConnected(): boolean;
  /** Notify the Studio of the page title */
  setPageTitle(title: string): Promise<void>;
  /** Notify the Studio of all item IDs present on the page */
  setPageItems(itemIds: string[]): Promise<void>;
  /** Notify the Studio of the current URL */
  setCurrentUrl(url: string): Promise<void>;
  /** Request the Studio to open an item for editing */
  openItem(itemId: string): Promise<void>;
  /** Notify the Studio that overlays were enabled/disabled */
  setOverlaysEnabled(enabled: boolean): Promise<void>;
  /** Clean up the connection */
  destroy(): void;
};

/**
 * Attempt to establish a Penpal connection with the DatoCMS Studio.
 * Returns null if not in an iframe or if connection fails/times out.
 */
export async function createStudioConnection(
  callbacks: StudioCallbacks
): Promise<StudioConnection | null> {
  // Only attempt connection if we're in an iframe
  if (!isInIframe()) {
    return null;
  }

  try {
    // Attempt to connect with a 20-second timeout
    const connection = connectToParent<StudioParentMethods>({
      timeout: 20000,
      methods: createChildMethods(callbacks)
    });

    const parent = await connection.promise;

    return createConnectionInterface(parent, connection);
  } catch (error) {
    // Connection failed or timed out - silently continue in standalone mode
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[@datocms/content-link] Failed to connect to Studio:', error);
    }
    return null;
  }
}

/**
 * Create the methods that the website exposes to the Studio.
 */
function createChildMethods(callbacks: StudioCallbacks): StudioChildMethods {
  return {
    navigateTo(payload: { url: string }): void {
      if (callbacks.onNavigateTo) {
        callbacks.onNavigateTo(payload.url);
      }
    },
    setOverlaysEnabled(payload: { enabled: boolean }): void {
      if (callbacks.onSetOverlaysEnabled) {
        callbacks.onSetOverlaysEnabled(payload.enabled);
      }
    },
    highlightItem(payload: { itemId: string }): void {
      if (callbacks.onHighlightItem) {
        callbacks.onHighlightItem(payload.itemId);
      }
    },
    clearHighlight(): void {
      if (callbacks.onClearHighlight) {
        callbacks.onClearHighlight();
      }
    }
  };
}

/**
 * Create the public connection interface that wraps the Penpal connection.
 */
function createConnectionInterface(
  parent: AsyncMethodReturns<StudioParentMethods>,
  connection: Connection<StudioParentMethods>
): StudioConnection {
  let destroyed = false;

  return {
    isConnected(): boolean {
      return !destroyed;
    },

    async setPageTitle(title: string): Promise<void> {
      if (destroyed) {
        return;
      }
      try {
        await parent.setPageTitle({ title });
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[@datocms/content-link] Failed to call setPageTitle:', error);
        }
      }
    },

    async setPageItems(itemIds: string[]): Promise<void> {
      if (destroyed) {
        return;
      }
      try {
        await parent.setPageItems({ itemIds });
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[@datocms/content-link] Failed to call setPageItems:', error);
        }
      }
    },

    async setCurrentUrl(url: string): Promise<void> {
      if (destroyed) {
        return;
      }
      try {
        await parent.setCurrentUrl({ url });
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[@datocms/content-link] Failed to call setCurrentUrl:', error);
        }
      }
    },

    async openItem(itemId: string): Promise<void> {
      if (destroyed) {
        return;
      }
      try {
        await parent.openItem({ itemId });
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[@datocms/content-link] Failed to call openItem:', error);
        }
      }
    },

    async setOverlaysEnabled(enabled: boolean): Promise<void> {
      if (destroyed) {
        return;
      }
      try {
        await parent.setOverlaysEnabled({ enabled });
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[@datocms/content-link] Failed to call setOverlaysEnabled:', error);
        }
      }
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      connection.destroy();
    }
  };
}

/**
 * Extract item ID from an edit URL, with error handling.
 */
export function safeExtractItemId(editUrl: string): string | null {
  try {
    return extractItemId(editUrl);
  } catch (error) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[@datocms/content-link] Failed to extract item ID from URL:', editUrl, error);
    }
    return null;
  }
}
