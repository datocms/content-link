export type EditUrlInfo = {
  environment: string;
  itemTypeId: string;
  itemId: string;
  fieldPath: string;
};

export function extractInfo(editUrl: string, editUrlRegExp: RegExp): EditUrlInfo | null {
  const match = editUrl.match(editUrlRegExp);

  if (!match || !match.groups) {
    return null;
  }

  return {
    environment: match.groups.environment || '__PRIMARY__',
    itemTypeId: match.groups.item_type_id,
    itemId: match.groups.item_id,
    fieldPath: match.groups.field_path
  };
}

export function extractItemIdsPerEnvironment(editUrls: Iterable<string>, editUrlRegExp: RegExp) {
  const itemIdsByEnvironment: Record<string, Set<string>> = {};

  for (const url of editUrls) {
    const info = extractInfo(url, editUrlRegExp);
    if (info) {
      const env = info.environment;
      if (!itemIdsByEnvironment[env]) {
        itemIdsByEnvironment[env] = new Set();
      }
      itemIdsByEnvironment[env].add(info.itemId);
    }
  }

  // Convert Sets to Arrays
  const result: Record<string, string[]> = {};
  for (const [env, itemIds] of Object.entries(itemIdsByEnvironment)) {
    result[env] = Array.from(itemIds);
  }

  return result;
}
