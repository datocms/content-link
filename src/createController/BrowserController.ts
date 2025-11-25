/**
 * Browser-only implementation that orchestrates stamping and click-to-edit managers.
 * Acts as a lightweight coordinator handling shared concerns like Studio connection and state events.
 */
import { AsyncMethodReturns, connectToParent } from 'penpal';
import { resolveDocument } from '../utils/dom.js';
import { extractItemId, extractItemIds } from '../utils/studio.js';
import { ClickToEditManager } from './clickToEdit/ClickToEditManager.js';
import { DomStampingManager } from './domStamping/DomStampingManager.js';
import { EventsManager } from './events/EventsManager.js';
import { StudioMethods } from './studio/types.js';
import type {
  ClickToEditStyle,
  Controller,
  CreateClickToEditControllerOptions,
  StampSummary
} from './types.js';

export class BrowserController implements Controller {
  private readonly root: ParentNode;
  private readonly doc: Document;
  private readonly clickToEditStyle?: ClickToEditStyle;
  private readonly onNavigateTo?: (url: string) => void;
  private readonly eventsManager: EventsManager;
  private readonly clickToEditManager: ClickToEditManager;

  private stampingManager: DomStampingManager | null = null;
  private studioConnection: {
    parent: AsyncMethodReturns<StudioMethods>;
    destroy: () => void;
  } | null = null;
  private disposed = false;

  constructor(options: CreateClickToEditControllerOptions) {
    this.root = options.root ?? document;
    this.doc = this.ensureDocument(this.root);
    this.clickToEditStyle = options.clickToEditStyle;
    this.onNavigateTo = options.onNavigateTo;

    // Initialize events manager
    this.eventsManager = new EventsManager({ doc: this.doc });

    // Initialize click-to-edit manager (but don't start it yet)
    this.clickToEditManager = new ClickToEditManager({
      doc: this.doc,
      style: this.clickToEditStyle,
      onEditClick: (editUrl) => this.handleEditClick(editUrl)
    });

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
    if (this.stampingManager) {
      this.stampingManager.stop();
      this.stampingManager = null;
    }
    // Clean up Studio connection
    if (this.studioConnection) {
      this.studioConnection.destroy();
      this.studioConnection = null;
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
  setCurrentUrl(url: string): void {
    this.studioConnection?.parent.setCurrentUrl({ url });
  }

  /** Enable click-to-edit functionality */
  enableClickToEdit(): void {
    if (this.disposed || this.clickToEditManager.isActive()) {
      return;
    }
    this.clickToEditManager.start();

    this.studioConnection?.parent.setClickToEditEnabled({ enabled: true });
  }

  /** Disable click-to-edit functionality */
  disableClickToEdit(): void {
    if (!this.clickToEditManager.isActive() || this.disposed) {
      return;
    }
    this.clickToEditManager.stop();

    this.studioConnection?.parent.setClickToEditEnabled({ enabled: false });
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
    this.studioConnection?.parent.setPageItems({
      itemIds: extractItemIds(summary.appliedStamps.values())
    });
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
    const isInFrame = typeof window !== 'undefined' && window.parent !== window;

    if (!isInFrame) {
      return;
    }

    // Attempt to connect with a 20-second timeout
    const connection = connectToParent<StudioMethods>({
      timeout: 20000,
      methods: {
        navigateTo: (payload: { url: string }) => {
          this.onNavigateTo?.(payload.url);
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

    // if (this.doc.title) {
    //   connection.setPageTitle(this.doc.title);
    // }
  }
}
