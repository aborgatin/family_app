// Every screen and state of the web app, as shot for review (README.md has the format). When a
// change adds or alters a screen, add or update its route here, so the next change shoots it too.
import { editIn, failClipboard, hang, noLists, rejectPushes, rowActions, section, toSection } from './helpers.mjs';

const INVITE = 'role=button[name="Пригласить взрослого…"]';
const ITEM = 'role=textbox[name="Товар «Молоко 3,2%»"]';
/** Steps from Home to the «Настройки списка» screen of the List with this name. */
const listSettings = (name) => [
  { click: `role=link[name=/${name}/]` },
  { click: 'role=link[name="Настройки списка"]' },
  { waitFor: 'role=textbox[name="Название"]' },
];
/** Steps on /setup of a fresh installation: Анна registers and lands on Home with the Defaults. */
const registerFirstMember = [
  { fill: 'role=textbox[name="Электронная почта"]', value: 'anna@example.com' },
  { fill: 'input[type=password]', value: 'password123' },
  { fill: 'role=textbox[name="Имя"]', value: 'Анна' },
  { click: 'text=Женский' },
  { click: 'role=button[name="Зарегистрироваться"]' },
  { waitFor: 'role=link[name=/Аптека/]' },
];
/** Steps from Home to the «Категории» screen of the Shopping list with this name. */
const categories = (name) => [
  ...listSettings(name),
  { click: 'role=link[name="Категории"]' },
  { waitFor: 'role=list[name="Категории"]' },
];
/** Steps from Home to the Item screen of an open Item: its row is edited, then «Подробнее». */
const openItem = (listName, kindWord, text) => [
  { click: `role=link[name=/${listName}/]` },
  { click: `role=textbox[name="${kindWord} «${text}»"]` },
  { click: 'role=link[name="Подробнее"]' },
  { waitFor: 'role=textbox[name="Название"]' },
];
/** Steps from Home to the Item screen of a Done Item: a tap on its text. */
const openDoneItem = (listName, text) => [
  { click: `role=link[name=/${listName}/]` },
  { click: `role=link[name="${text}"]` },
  { waitFor: 'role=textbox[name="Название"]' },
];
const showInvites = async (page) => {
  await page.locator(INVITE).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
};

export default {
  routes: [
    // Auth
    { name: 'setup', path: '/setup', auth: 'fresh' },
    {
      name: 'setup-field-error',
      path: '/setup',
      auth: 'fresh',
      steps: [
        { fill: 'role=textbox[name="Электронная почта"]', value: 'anna@example' },
        { click: 'role=button[name="Зарегистрироваться"]' },
        { wait: 300 },
      ],
    },
    { name: 'login', path: '/login', auth: 'loggedOut' },
    {
      name: 'login-form-error',
      path: '/login',
      auth: 'loggedOut',
      steps: [
        { fill: 'role=textbox[name="Электронная почта"]', value: 'anna@example.com' },
        { fill: 'input[type=password]', value: 'wrong-password' },
        { press: 'Enter' },
        { waitFor: 'role=alert' },
      ],
    },
    {
      name: 'invite-checking',
      path: '/invite/{inviteToken}',
      auth: 'loggedOut',
      initScript: hang('/api/invites/by-token/'),
    },
    { name: 'invite-invalid', path: '/invite/no-such-token-0123456789abcdefghijklmnopqrstu', auth: 'loggedOut' },
    { name: 'invite-form', path: '/invite/{inviteToken}', auth: 'loggedOut' },
    { name: 'reset-password', path: '/reset-password/{resetToken}', auth: 'loggedOut' },

    // Home
    { name: 'home', path: '/', steps: [{ waitFor: 'text=Супермаркет' }] },
    { name: 'home-empty', path: '/', initScript: noLists, steps: [{ waitFor: 'text=Списков пока нет' }] },
    // A fresh installation right after the first Member registers: the Default Shopping lists.
    { name: 'home-defaults', path: '/setup', auth: 'fresh', isolate: true, steps: [...registerFirstMember] },
    {
      name: 'list-defaults-supermarket',
      path: '/setup',
      auth: 'fresh',
      isolate: true,
      steps: [
        ...registerFirstMember,
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: 'role=button[name="Новая категория"]' },
      ],
    },
    {
      name: 'home-scrolled',
      path: '/',
      fullPage: false,
      steps: [{ eval: "document.body.style.minHeight = '3000px'; window.scrollTo(0, 120)" }, { wait: 400 }],
    },
    {
      name: 'home-offline-popover',
      path: '/',
      offline: 'afterLoad',
      steps: [
        // Home sends no requests; fail one on Settings, then go back with the globe still shown.
        { click: 'role=link[name="Настройки"]' },
        { waitFor: 'role=button[name="Нет связи с сервером"]' },
        async (page) => {
          await page.goBack();
          await page.locator('role=heading[name="Семья"]').waitFor();
        },
        { click: 'role=button[name="Нет связи с сервером"]' },
        { waitFor: 'role=dialog' },
        { wait: 300 },
      ],
    },

    // Lists
    {
      name: 'new-list-sheet',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=button[name="Добавить список"]' },
        { fill: 'role=dialog >> role=textbox[name="Название"]', value: 'Ремонт на даче' },
        { click: 'role=dialog >> text=TODO' },
        { click: 'role=dialog >> text=Личный' },
        { wait: 400 },
      ],
    },
    {
      name: 'new-list-sheet-wish',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=button[name="Добавить список"]' },
        { fill: 'role=dialog >> role=textbox[name="Название"]', value: 'Подарки на Новый год' },
        { click: 'role=dialog >> text=Желания' },
        { wait: 400 },
      ],
    },
    {
      name: 'new-list-sheet-errors',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=button[name="Добавить список"]' },
        { click: 'role=dialog >> role=button[name="Готово"]' },
        { wait: 400 },
      ],
    },
    {
      name: 'list-shopping',
      path: '/',
      steps: [{ click: 'role=link[name=/Супермаркет/]' }, { waitFor: ITEM }],
    },
    {
      name: 'list-shopping-empty',
      path: '/',
      steps: [{ click: 'role=link[name=/Аптека/]' }, { waitFor: 'text=Товаров пока нет' }],
    },
    {
      // A Shopping list with Categories: «Еда», «Бытовая химия» (empty), then the untitled Unnamed
      // category, each with its own «Новый товар»; «Новая категория» above «Куплено».
      name: 'list-categories',
      path: '/',
      steps: [{ click: 'role=link[name=/Гипермаркет/]' }, { waitFor: 'role=textbox[name="Товар «Батарейки»"]' }],
    },
    {
      // «Новая категория» tapped: a new section at the end with its title being typed.
      name: 'list-category-naming',
      path: '/',
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=button[name="Новая категория"]' },
        { fill: 'role=textbox[name="Название категории"]', value: 'Напит' },
        { wait: 200 },
      ],
    },
    {
      // Enter named it «Напитки»: the focus is in its own «Новый товар».
      name: 'list-category-added',
      path: '/',
      isolate: true,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=button[name="Новая категория"]' },
        { fill: 'role=textbox[name="Название категории"]', value: 'Напитки' },
        { press: 'Enter' },
        { waitFor: 'role=region[name="Напитки"] >> role=textbox[name="Новый товар"]' },
        { wait: 300 },
      ],
    },
    {
      // A shopping Item being edited on a list with Categories: its Description, then the
      // Category chip «Еда ⌄».
      name: 'list-item-category-chip',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { click: 'role=textbox[name="Товар «Молоко»"]' },
        { waitFor: 'role=button[name="Категория: Еда"]' },
      ],
    },
    {
      // The chip's menu: the Categories in order, «Без категории» in its place, «Еда» ticked.
      name: 'list-item-category-menu',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { click: 'role=textbox[name="Товар «Молоко»"]' },
        { click: 'role=button[name="Категория: Еда"]' },
        { waitFor: 'role=menu' },
        { wait: 200 },
      ],
    },
    {
      // «мо» typed in «Еда»'s «Новый товар»: up to 5 names from the List's Item history under it,
      // cleared ones included.
      name: 'list-suggestions',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]' },
        { fill: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]', value: 'мо' },
        { waitFor: 'role=group[name="Подсказки"]' },
        { wait: 200 },
      ],
    },
    {
      // No name in the history starts with «щ»: no suggestions, just the typed text.
      name: 'list-suggestions-none',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]' },
        { fill: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]', value: 'щ' },
        { wait: 200 },
      ],
    },
    {
      // «Морковь» removed from the Item history with its ×, offline (#78): gone from the suggestions
      // at once, no action sheet; «мо» stays typed and the field keeps the focus.
      name: 'list-suggestion-removed-offline',
      path: '/',
      fullPage: false,
      isolate: true,
      offline: 'afterLoad',
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]' },
        { fill: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]', value: 'мо' },
        { click: 'role=button[name="Удалить подсказку „Морковь“"]' },
        { wait: 300 },
      ],
    },
    {
      // «молоко» added again (in «Бытовая химия»): no duplicate, the open «Молоко» in «Еда» is
      // highlighted, and the add field is empty and keeps the focus.
      name: 'list-re-adding-open',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=region[name="Бытовая химия"] >> role=textbox[name="Новый товар"]' },
        { fill: 'role=region[name="Бытовая химия"] >> role=textbox[name="Новый товар"]', value: ' молоко' },
        { press: 'Enter' },
        { waitFor: '[data-highlighted]' },
        { wait: 100 },
      ],
    },
    {
      // The bought «Яблоки» added again in «Бытовая химия», offline: it leaves «Куплено» and is open
      // in «Бытовая химия» at once.
      name: 'list-re-adding-bought-offline',
      path: '/',
      isolate: true,
      offline: 'afterLoad',
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=region[name="Бытовая химия"] >> role=textbox[name="Новый товар"]' },
        { fill: 'role=region[name="Бытовая химия"] >> role=textbox[name="Новый товар"]', value: 'яблоки' },
        { press: 'Enter' },
        { waitFor: 'role=region[name="Бытовая химия"] >> role=textbox[name="Товар «Яблоки»"]' },
        { wait: 200 },
      ],
    },
    {
      name: 'list-todo',
      path: '/',
      steps: [{ click: 'role=link[name=/Дела по дому/]' }, { waitFor: 'role=textbox[name^="Задача"]' }],
    },
    {
      name: 'list-todo-empty',
      path: '/',
      steps: [{ click: 'role=link[name=/Ремонт/]' }, { waitFor: 'text=Задач пока нет' }],
    },
    {
      // Enter added «Масло» and keeps the focus in «Новый товар» for the next Item.
      name: 'list-item-adding',
      path: '/',
      isolate: true,
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        { click: 'role=textbox[name="Новый товар"]' },
        { fill: 'role=textbox[name="Новый товар"]', value: 'Масло' },
        { press: 'Enter' },
        { fill: 'role=textbox[name="Новый товар"]', value: 'Ке' },
        toSection('Товары', 120),
        { wait: 300 },
      ],
    },
    {
      // «Масло» typed in «Новый товар»: the Description icon button at the field's end (#79).
      name: 'list-add-description-button',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        { click: 'role=textbox[name="Новый товар"]' },
        { fill: 'role=textbox[name="Новый товар"]', value: 'Масло сливочное 82,5%' },
        toSection('Товары', 120),
        { wait: 300 },
      ],
    },
    {
      // The icon tapped in «Еда»'s «Новый товар»: the grey one-line «Описание» under the typed
      // name, focused, being typed in; the suggestions hidden (#79).
      name: 'list-add-description-open',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Гипермаркет/]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { click: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]' },
        { fill: 'role=region[name="Еда"] >> role=textbox[name="Новый товар"]', value: 'Мука' },
        { click: 'role=region[name="Еда"] >> role=button[name="Добавить описание"]' },
        { fill: 'role=region[name="Еда"] >> role=textbox[name="Описание"]', value: 'Цельнозерновая' },
        { wait: 300 },
      ],
    },
    {
      // The Item being edited: its grey «Описание» line, empty, under the title, and «Подробнее»
      // at the end of the line under it (#83).
      name: 'list-item-description-empty',
      path: '/',
      fullPage: false,
      steps: [{ click: 'role=link[name=/Супермаркет/]' }, { click: ITEM }, { waitFor: 'role=textbox[name="Описание «Молоко 3,2%»"]' }],
    },
    {
      // Tapping the cut Description line opens it in full; Enter started a second line.
      name: 'list-item-description-editing',
      path: '/',
      isolate: true,
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { click: 'text=Нарезанный, половинку' },
        { waitFor: 'role=textbox[name="Описание «Хлеб бородинский»"]' },
        async (page) => page.keyboard.type('\nВитрина справа от кассы'),
        { wait: 200 },
      ],
    },
    {
      // A Todo Item's Description being edited.
      name: 'list-todo-description-editing',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Дела по дому/]' },
        { click: 'text=Детская стоматология' },
        { waitFor: 'role=textbox[name="Описание «Записать Машу к стоматологу»"]' },
      ],
    },
    {
      name: 'list-item-empty-text',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { fill: ITEM, value: '' },
        { press: 'Enter' },
        { waitFor: 'text=Заполните это поле' },
      ],
    },
    {
      name: 'list-items-edit',
      path: '/',
      fullPage: false,
      steps: [{ click: 'role=link[name=/Супермаркет/]' }, { waitFor: ITEM }, editIn('Товары'), toSection('Товары', 0)],
    },
    {
      // Touch: the first Item swiped left; mouse: its context menu.
      name: 'list-item-actions',
      path: '/',
      fullPage: false,
      steps: [{ click: 'role=link[name=/Супермаркет/]' }, rowActions('Товары')],
    },
    {
      name: 'list-item-delete-confirm',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        editIn('Товары'),
        { click: 'role=button[name="Удалить «Молоко 3,2%»"]' },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      // Added offline: shown at once, with the offline indicator as the only sign.
      name: 'list-items-offline',
      path: '/',
      isolate: true,
      offline: 'afterLoad',
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        { fill: 'role=textbox[name="Новый товар"]', value: 'Кефир' },
        { press: 'Enter' },
        { waitFor: 'role=textbox[name="Товар «Кефир»"]' },
      ],
    },
    {
      // Ticked off offline: under «Куплено» at once, on top, with the offline indicator.
      name: 'list-item-done-offline',
      path: '/',
      isolate: true,
      offline: 'afterLoad',
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        { click: 'role=checkbox[name="Куплено «Яйца, десяток»"]' },
        { waitFor: 'role=checkbox[name="Куплено «Яйца, десяток»"][checked]' },
      ],
    },
    {
      // The server rejects the change: the app-wide Toast with the reason, the server's value back.
      name: 'list-save-rejected',
      path: '/',
      isolate: true,
      initScript: rejectPushes('list.owner_only'),
      steps: [
        ...listSettings('Супермаркет'),
        { click: 'role=radiogroup[name="Видимость"] >> text=Личный' },
        { waitFor: 'role=alert' },
        { wait: 300 },
      ],
    },
    {
      name: 'list-done-edit',
      path: '/',
      fullPage: false,
      steps: [{ click: 'role=link[name=/Супермаркет/]' }, { waitFor: ITEM }, editIn('Куплено'), toSection('Куплено', 0)],
    },
    {
      // «Очистить» on «Куплено»: the plural action sheet.
      name: 'list-clear-confirm',
      path: '/',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        { click: `${section('Куплено')} >> role=button[name="Очистить"]` },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      // Cleared offline: «Куплено» goes at once, with the offline indicator as the only sign.
      name: 'list-cleared-offline',
      path: '/',
      isolate: true,
      offline: 'afterLoad',
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        { click: `${section('Куплено')} >> role=button[name="Очистить"]` },
        { click: 'role=dialog >> role=button[name="Очистить"]' },
        async (page) => page.locator(section('Куплено')).waitFor({ state: 'detached' }),
        { wait: 300 },
      ],
    },
    {
      name: 'list-wish',
      path: '/',
      steps: [{ click: 'role=link[name=/Подарки/]' }, { waitFor: 'text=Исполнено' }],
    },
    {
      name: 'list-wish-empty',
      path: '/',
      steps: [{ click: 'role=link[name=/Книги/]' }, { waitFor: 'text=Желаний пока нет' }],
    },

    // The Item screen (#83), opened by «Подробнее» on the row being edited, or a Done row's text
    // A shopping Item: the name, the large «Описание» with its link, the Done toggle, who added it.
    { name: 'item-shopping', path: '/', steps: openItem('Супермаркет', 'Товар', 'Хлеб бородинский') },
    // A Done one: ticked, with «Купила Анна, …» under «Добавила Анна, …».
    { name: 'item-shopping-done', path: '/', steps: openDoneItem('Супермаркет', 'Сыр') },
    { name: 'item-todo', path: '/', steps: openItem('Дела по дому', 'Задача', 'Записать Машу к стоматологу') },
    { name: 'item-todo-done', path: '/', steps: openDoneItem('Дела по дому', 'Оплатить интернет') },
    // A wish without a Description: the empty large field.
    { name: 'item-wish', path: '/', steps: openItem('Подарки', 'Желание', 'Самокат') },
    { name: 'item-wish-done', path: '/', steps: openDoneItem('Подарки', 'Набор фломастеров') },
    {
      // The Description tapped beside its link: one field with the whole text, a paragraph added.
      name: 'item-description-editing',
      path: '/',
      isolate: true,
      steps: [
        ...openItem('Супермаркет', 'Товар', 'Хлеб бородинский'),
        // Its first line: the middle of the text is the link.
        async (page) => page.locator('p:has-text("Нарезанный, половинку")').click({ position: { x: 8, y: 8 } }),
        async (page) => page.keyboard.type('\n\nВитрина справа от кассы, верхняя полка'),
        { wait: 200 },
      ],
    },
    {
      name: 'item-delete-confirm',
      path: '/',
      fullPage: false,
      steps: [
        ...openItem('Супермаркет', 'Товар', 'Молоко 3,2%'),
        { click: 'role=button[name="Удалить"]' },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      // An Item that is unknown, or was deleted meanwhile: the List is there, the Item is not.
      name: 'item-missing',
      path: '/',
      steps: [
        { click: 'role=link[name=/Супермаркет/]' },
        { waitFor: ITEM },
        async (page) => page.goto(`${page.url()}/items/00000000-0000-7000-8000-000000000000`),
        { waitFor: 'role=alert' },
      ],
    },
    {
      // Deleted in another tab while the Item screen is open here.
      name: 'item-gone',
      path: '/',
      isolate: true,
      steps: [
        ...openItem('Супермаркет', 'Товар', 'Молоко 3,2%'),
        async (page) => {
          const other = await page.context().newPage();
          await other.goto(page.url());
          await other.locator('role=button[name="Удалить"]').click();
          await other.locator('role=dialog >> role=button[name="Удалить"]').click();
          await other.locator(ITEM.replace('Молоко 3,2%', 'Яйца, десяток')).waitFor();
          await other.close();
        },
        { waitFor: 'role=alert' },
      ],
    },

    // «Настройки списка», opened by the gear on the List screen
    { name: 'list-settings', path: '/', steps: listSettings('Супермаркет') },
    // Борис's Shared List: Анна may rename it, but sees no Visibility and no «Удалить список».
    { name: 'list-settings-not-owner', path: '/', steps: listSettings('Гараж') },
    // A Wish list is always Shared: no Visibility, even for its Owner.
    { name: 'list-settings-wish', path: '/', steps: listSettings('Подарки') },
    {
      name: 'list-delete-confirm',
      path: '/',
      fullPage: false,
      steps: [
        ...listSettings('Аптека'),
        { click: 'role=button[name="Удалить список"]' },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      name: 'list-deleted',
      path: '/',
      isolate: true,
      steps: [
        ...listSettings('Аптека'),
        { click: 'role=button[name="Удалить список"]' },
        { click: 'role=dialog >> role=button[name="Удалить"]' },
        { waitFor: 'role=heading[name="Семья"]' },
        { wait: 400 },
      ],
    },
    {
      // Deleted in another tab while «Настройки списка» is open here.
      name: 'list-settings-gone',
      path: '/',
      isolate: true,
      steps: [
        ...listSettings('Аптека'),
        async (page) => {
          const other = await page.context().newPage();
          await other.goto(page.url());
          await other.locator('role=button[name="Удалить список"]').click();
          await other.locator('role=dialog >> role=button[name="Удалить"]').click();
          await other.locator('role=heading[name="Семья"]').waitFor();
          await other.close();
        },
        { waitFor: 'role=alert' },
      ],
    },

    // «Категории», from a Shopping list's «Настройки списка»
    // «Еда», «Бытовая химия», then «Без категории» (grey), and «Новая категория».
    { name: 'categories', path: '/', steps: categories('Гипермаркет') },
    // A Shopping list without Categories: only «Без категории».
    { name: 'categories-empty', path: '/', steps: categories('Аптека') },
    // Edit mode: ⊖ and drag handles; «Без категории» has a handle but no ⊖.
    { name: 'categories-edit', path: '/', steps: [...categories('Гипермаркет'), editIn('Категории')] },
    { name: 'categories-row-actions', path: '/', fullPage: false, steps: [...categories('Гипермаркет'), rowActions('Категории')] },
    {
      // «Еда» has three Items (two open, one Done): they stay in the list without a Category.
      name: 'categories-delete-confirm',
      path: '/',
      fullPage: false,
      steps: [
        ...categories('Гипермаркет'),
        editIn('Категории'),
        { click: 'role=button[name="Удалить «Еда»"]' },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      // «Бытовая химия» is empty: the sheet has no message.
      name: 'categories-delete-confirm-empty',
      path: '/',
      fullPage: false,
      steps: [
        ...categories('Гипермаркет'),
        editIn('Категории'),
        { click: 'role=button[name="Удалить «Бытовая химия»"]' },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      // A name can't be empty: the footer says so and the saved name comes back on blur.
      name: 'categories-name-required',
      path: '/',
      steps: [
        ...categories('Гипермаркет'),
        { fill: 'role=textbox[name="Категория „Еда“"]', value: '' },
        { press: 'Enter' },
        { wait: 300 },
      ],
    },
    {
      // After deleting «Еда»: its Items are in the Unnamed category on the List screen.
      name: 'categories-deleted-list',
      path: '/',
      isolate: true,
      steps: [
        ...categories('Гипермаркет'),
        editIn('Категории'),
        { click: 'role=button[name="Удалить «Еда»"]' },
        { click: 'role=dialog >> role=button[name="Удалить"]' },
        { waitFor: 'role=button[name="Удалить «Бытовая химия»"]' },
        { click: 'role=link[name="Настройки списка"]' },
        { click: 'role=link[name="Гипермаркет"]' },
        { waitFor: 'role=textbox[name="Товар «Батарейки»"]' },
        { wait: 300 },
      ],
    },
    {
      name: 'list-not-found',
      path: '/lists/00000000-0000-4000-8000-000000000000',
      steps: [{ waitFor: 'role=alert' }],
    },

    // Settings
    { name: 'settings', path: '/settings' },
    {
      name: 'settings-invites-edit',
      path: '/settings',
      fullPage: false,
      steps: [editIn('Приглашения'), toSection('Приглашения', 120)],
    },
    {
      name: 'settings-children-edit',
      path: '/settings',
      fullPage: false,
      steps: [editIn('Дети'), toSection('Дети', 120)],
    },
    {
      name: 'settings-fields-edit',
      path: '/settings',
      fullPage: false,
      steps: [editIn('Поля профиля'), toSection('Поля профиля', 120)],
    },
    // Touch variants show the swipe, mouse variants the context menu.
    { name: 'settings-row-actions', path: '/settings', fullPage: false, steps: [rowActions('Приглашения')] },
    {
      name: 'settings-save-failed',
      path: '/settings',
      offline: 'afterLoad',
      fullPage: false,
      steps: [
        { fill: `${section('Ваш профиль')} >> role=textbox[name="Имя"]`, value: 'Анна Петровна' },
        { press: 'Enter' },
        { waitFor: 'role=button[name="Повторить"]' },
        toSection('Ваш профиль'),
        { wait: 300 },
      ],
    },
    {
      name: 'settings-link-copied',
      path: '/settings',
      fullPage: false,
      isolate: true,
      steps: [{ click: INVITE }, { waitFor: 'text=Ссылка скопирована' }, showInvites],
    },
    {
      name: 'settings-copy-failed',
      path: '/settings',
      fullPage: false,
      isolate: true,
      initScript: failClipboard,
      steps: [
        { click: INVITE },
        { waitFor: 'role=button[name="Скопировать"]' },
        { click: 'role=button[name="Скопировать"]' },
        { waitFor: 'role=alert' },
        showInvites,
      ],
    },
    {
      name: 'settings-no-invites',
      path: '/settings',
      fullPage: false,
      isolate: true,
      steps: [
        // The seed leaves one active Invite: revoke it through the UI's own confirmation.
        editIn('Приглашения'),
        { click: `${section('Приглашения')} >> role=button[name=/^Удалить «/] >> nth=0` },
        { click: 'role=dialog >> role=button[name="Удалить"]' },
        { waitFor: 'text=Активных приглашений нет' },
        toSection('Приглашения', -150),
      ],
    },
    {
      name: 'settings-logout',
      path: '/settings',
      fullPage: false,
      steps: [{ click: 'role=button[name="Выйти"]' }, { waitFor: 'role=dialog' }, { wait: 400 }],
    },
    {
      // Logout with an unsent change (a Child renamed offline): the warning that it will be lost.
      name: 'settings-logout-unsent',
      path: '/settings',
      offline: 'afterLoad',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Маша/]' },
        { waitFor: 'role=radiogroup[name="Цвет"]' },
        { fill: 'role=textbox[name="Имя"]', value: 'Мария' },
        { press: 'Enter' },
        { wait: 300 },
        async (page) => page.goBack(),
        { click: 'role=button[name="Выйти"]' },
        { click: 'role=dialog >> role=button[name="Выйти"]' },
        { waitFor: 'role=dialog[name^="Нет соединения"]' },
        { wait: 400 },
      ],
    },

    // Password
    { name: 'password-empty', path: '/settings/password' },
    {
      name: 'password-error',
      path: '/settings/password',
      steps: [
        { fill: 'input[name="currentPassword"]', value: 'not-my-password' },
        { fill: 'input[name="newPassword"]', value: 'brand-new-pass' },
        { click: 'role=button[name="Готово"]' },
        { waitFor: 'role=alert' },
      ],
    },
    {
      name: 'settings-password-changed',
      path: '/settings/password',
      fullPage: false,
      isolate: true,
      steps: [
        { fill: 'input[name="currentPassword"]', value: 'password123' },
        { fill: 'input[name="newPassword"]', value: 'password456' },
        { click: 'role=button[name="Готово"]' },
        { waitFor: 'text=Пароль изменён' },
        toSection('Ваш профиль', -100),
      ],
    },

    // Child screen and sheets
    {
      name: 'child',
      path: '/settings',
      steps: [{ click: 'role=link[name=/Маша/]' }, { waitFor: 'role=radiogroup[name="Цвет"]' }],
    },
    {
      name: 'child-delete-confirm',
      path: '/settings',
      fullPage: false,
      steps: [
        { click: 'role=link[name=/Соня/]' },
        { click: 'role=button[name="Удалить ребёнка"]' },
        { waitFor: 'role=dialog' },
        { wait: 400 },
      ],
    },
    {
      name: 'new-child-sheet',
      path: '/settings',
      fullPage: false,
      steps: [
        { click: 'role=button[name="Добавить ребёнка"]' },
        { fill: 'role=dialog >> role=textbox[name="Имя"]', value: 'Ваня' },
        { click: 'role=dialog >> role=radio[name="Оранжевый"]' },
        { wait: 400 },
      ],
    },
    {
      name: 'new-field-sheet',
      path: '/settings',
      fullPage: false,
      steps: [
        { click: 'role=button[name="Добавить поле"]' },
        { fill: 'role=dialog >> role=textbox[name="Название"]', value: 'Группа крови' },
        { click: 'role=dialog >> text=Дата' },
        { wait: 300 },
      ],
    },
  ],
};
