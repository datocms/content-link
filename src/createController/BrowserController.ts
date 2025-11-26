/**
 * Browser-only implementation that orchestrates stamping and click-to-edit managers.
 * Acts as a lightweight coordinator handling shared concerns like Studio connection and state events.
 */
import penpal, { type AsyncMethodReturns } from 'penpal';
import { inIframe, resolveDocument, toCompletePath } from '../utils/dom.js';
import { extractItemId, extractItemIds } from '../utils/studio.js';
import { ClickToEditManager } from './clickToEdit/ClickToEditManager.js';
import { findEditableTarget } from './clickToEdit/findEditableTarget.js';
import { DomStampingManager } from './domStamping/DomStampingManager.js';
import { AUTOMATIC_STAMP_ATTRIBUTE, MANUAL_STAMP_ATTRIBUTE } from './domStamping/constants.js';
import { EventsManager } from './events/EventsManager.js';
import type { StudioMethods } from './studio/types.js';
import type { Controller, CreateControllerOptions, StampSummary } from './types.js';

export class BrowserController implements Controller {
  private readonly root: ParentNode;
  private readonly doc: Document;
  private readonly onNavigateTo?: (path: string) => void;
  private readonly eventsManager: EventsManager;
  private readonly clickToEditManager: ClickToEditManager;
  private readonly stampingManager: DomStampingManager;

  private studioConnection: {
    parent: AsyncMethodReturns<StudioMethods>;
    destroy: () => void;
  } | null = null;

  private disposed = false;

  private currentPath = toCompletePath(document.location.toString());

  constructor(options: CreateControllerOptions) {
    this.root = options.root ?? document;
    this.doc = this.ensureDocument(this.root);
    this.onNavigateTo = options.onNavigateTo;

    // Initialize events manager
    this.eventsManager = new EventsManager({ doc: this.doc });

    // Initialize click-to-edit manager (but don't start it yet)
    this.clickToEditManager = new ClickToEditManager(this.doc, (editUrl) =>
      this.handleEditClick(editUrl)
    );

    this.initializeStudioConnection();

    // Start stamping immediately
    this.stampingManager = new DomStampingManager({
      root: this.root,
      doc: this.doc,
      onStamped: (summary) => this.handleStampResult(summary)
    });
    this.stampingManager.start();
  }

  private ensureDocument(root: ParentNode): Document {
    const resolved = resolveDocument(root);
    if (!resolved) {
      throw new Error('Unable to resolve document for click-to-edit');
    }
    return resolved;
  }

  /** Permanently shut down the controller and clear generated attributes. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    // Disable click-to-edit first
    this.clickToEditManager.stop();
    // Stop stamping and clear stamps
    this.stampingManager.stop();

    // Clean up Studio connection
    if (this.studioConnection) {
      this.studioConnection.destroy();
    }
    this.disposed = true;
  }

  /** Whether the controller has been disposed. */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Notify the Studio of the current URL (for client-side routing).
   */
  setCurrentPath(urlOrPath: string): void {
    this.currentPath = toCompletePath(urlOrPath);
  }

  /** Enable click-to-edit functionality */
  enableClickToEdit(): void {
    if (this.disposed || this.clickToEditManager.isActive()) {
      return;
    }
    this.clickToEditManager.start();
    this.notifyStateChangeToStudio();
  }

  /** Disable click-to-edit functionality */
  disableClickToEdit(): void {
    if (!this.clickToEditManager.isActive() || this.disposed) {
      return;
    }
    this.clickToEditManager.stop();
    this.notifyStateChangeToStudio();
  }

  /** Whether click-to-edit is currently enabled */
  isClickToEditEnabled(): boolean {
    return this.clickToEditManager.isActive() && !this.disposed;
  }

  /**
   * Handle stamp results from DomStampingManager
   */
  private handleStampResult(summary: StampSummary): void {
    this.eventsManager.emitStamped(summary);
    this.notifyStateChangeToStudio();
  }

  private notifyStateChangeToStudio() {
    this.studioConnection?.parent.onStateChange({
      clickToEditEnabled: this.clickToEditManager.isActive(),
      currentPath: this.currentPath,
      pageItemIds: this.getPageItemIds()
    });
  }

  /**
   * Gather all item IDs from stamped elements in the page.
   */
  private getPageItemIds(): string[] {
    // Find all stamped elements in the DOM
    const stampedElements = this.root.querySelectorAll(
      `[${MANUAL_STAMP_ATTRIBUTE}], [${AUTOMATIC_STAMP_ATTRIBUTE}]`
    );

    // Collect all edit URLs
    const editUrls: string[] = [];
    for (const element of stampedElements) {
      const target = findEditableTarget(element as Element);
      if (target) {
        editUrls.push(target.editUrl);
      }
    }

    // Extract unique item IDs from edit URLs
    return extractItemIds(editUrls);
  }

  /**
   * Handle edit click from ClickToEditManager
   */
  private handleEditClick(editUrl: string): void {
    if (this.studioConnection) {
      const itemId = extractItemId(editUrl);

      if (itemId) {
        this.studioConnection.parent.openItem({ itemId });
      }
    } else {
      // Fallback: open in new tab
      const opener = this.doc.defaultView ?? (typeof window !== 'undefined' ? window : null);

      opener?.open(editUrl, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Initialize the Studio connection if we're in an iframe.
   * This is async but we don't await it - connection happens in the background.
   */
  private async initializeStudioConnection() {
    if (!inIframe()) {
      return;
    }

    // Attempt to connect with a 20-second timeout
    const connection = penpal.connectToParent<StudioMethods>({
      timeout: 20000,
      methods: {
        navigateTo: (payload: { path: string }) => {
          this.onNavigateTo?.(payload.path);
        },
        setClickToEditEnabled: (payload: { enabled: boolean }) => {
          if (payload.enabled) {
            this.enableClickToEdit();
          } else {
            this.disableClickToEdit();
          }
        },
        highlightItem: (payload: { itemId: string }) => {
          // TODO
        },
        clearHighlight(): void {
          // TODO
        }
      }
    });

    const parent = await connection.promise;

    if (this.disposed) {
      connection.destroy();
      return;
    }

    this.studioConnection = {
      parent,
      destroy: () => {
        connection.destroy;
      }
    };

    this.notifyStateChangeToStudio();
  }
}
