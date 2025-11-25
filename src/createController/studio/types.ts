/**
 * Methods that the Studio exposes to the website (Child to Parent).
 */
export type StudioMethods = {
  setPageTitle(payload: { title: string }): Promise<void>;
  setPageItems(payload: { itemIds: string[] }): Promise<void>;
  setCurrentUrl(payload: { url: string }): Promise<void>;
  openItem(payload: { itemId: string }): Promise<void>;
  setClickToEditEnabled(payload: { enabled: boolean }): Promise<void>;
};
