/** Route of the List screen, opened from «Списки» on Home. */
export const LIST_PATH = '/lists/:id';

/** Route of a List's «Настройки списка» screen, opened from the gear on the List screen. */
export const LIST_SETTINGS_PATH = '/lists/:id/settings';

/** Path of the screen of the List with this id. */
export function listPath(id: string): string {
  return pathOf(LIST_PATH, { id });
}

/** Path of the «Настройки списка» screen of the List with this id. */
export function listSettingsPath(id: string): string {
  return pathOf(LIST_SETTINGS_PATH, { id });
}

/** Route of a Shopping list's «Категории» screen, opened from its «Настройки списка». */
export const LIST_CATEGORIES_PATH = '/lists/:id/categories';

/** Path of the «Категории» screen of the List with this id. */
export function listCategoriesPath(id: string): string {
  return pathOf(LIST_CATEGORIES_PATH, { id });
}

/** Route of the Item screen, opened from the Item's row on the List screen. */
export const LIST_ITEM_PATH = '/lists/:id/items/:itemId';

/** Path of the Item screen of this Item of the List with this id. */
export function listItemPath(id: string, itemId: string): string {
  return pathOf(LIST_ITEM_PATH, { id, itemId });
}

/** Route of a Todo list's «Выполненные ранее» screen, opened from the row under «Выполнено». */
export const LIST_DONE_EARLIER_PATH = '/lists/:id/done-earlier';

/** Path of the «Выполненные ранее» screen of the List with this id. */
export function listDoneEarlierPath(id: string): string {
  return pathOf(LIST_DONE_EARLIER_PATH, { id });
}

/** The route with each `:name` replaced by its value, URI-encoded. */
function pathOf(route: string, params: Record<string, string>): string {
  return route.replace(/:(\w+)/g, (part, name: string) =>
    name in params ? encodeURIComponent(params[name] ?? '') : part,
  );
}
