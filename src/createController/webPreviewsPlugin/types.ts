import type { EditUrlInfo } from '../../utils/editUrl.js';

export type WebsiteState = {
  clickToEditEnabled: boolean;
  path: string;
  itemIdsPerEnvironment: Record<string, string[]>;
};

export type OnInitData = {
  editUrlRegExp: { source: string; flags: string };
};

/**
 * Methods that the Web Previews plugin exposes to the website (Child to Parent).
 */
export type WebPreviewsPluginMethods = {
  onInit(): Promise<OnInitData>;
  onPing(): Promise<void>;
  onStateChange(payload: WebsiteState): Promise<void>;
  openItem(payload: EditUrlInfo): Promise<void>;
};
