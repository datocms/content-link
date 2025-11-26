export type WebsiteState = {
  clickToEditEnabled: boolean;
  currentUrl: string;
  pageItemIds: string[];
};

/**
 * Methods that the Studio exposes to the website (Child to Parent).
 */
export type StudioMethods = {
  onStateChange(payload: WebsiteState): Promise<void>;
  openItem(payload: { itemId: string }): Promise<void>;
};
