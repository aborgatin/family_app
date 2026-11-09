/** Route of the List screen, opened from «Списки» on Home. */
export const LIST_PATH = '/lists/:id';

/** Route of a List's «Настройки списка» screen, opened from the gear on the List screen. */
export const LIST_SETTINGS_PATH = '/lists/:id/settings';

/** Path of the screen of the List with this id. */
export function listPath(id: string): string {
  return LIST_PATH.replace(':id', encodeURIComponent(id));
}

/** Path of the «Настройки списка» screen of the List with this id. */
export function listSettingsPath(id: string): string {
  return LIST_SETTINGS_PATH.replace(':id', encodeURIComponent(id));
}
