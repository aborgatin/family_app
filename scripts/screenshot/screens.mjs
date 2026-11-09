// Every screen and state of the web app, as shot for review (README.md has the format). When a
// change adds or alters a screen, add or update its route here, so the next change shoots it too.
import { editIn, failClipboard, hang, noLists, rowActions, section, toSection } from './helpers.mjs';

const INVITE = 'role=button[name="Пригласить взрослого…"]';
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
        { fill: 'role=dialog >> role=textbox[name="Название"]', value: 'Желания Пети' },
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
      steps: [{ click: 'role=link[name=/Супермаркет/]' }, { waitFor: 'text=Товаров пока нет' }],
    },
    {
      name: 'list-todo',
      path: '/',
      steps: [{ click: 'role=link[name=/Ремонт/]' }, { waitFor: 'text=Задач пока нет' }],
    },
    {
      name: 'list-wish',
      path: '/',
      steps: [{ click: 'role=link[name=/Желания Маши/]' }, { waitFor: 'text=Желаний пока нет' }],
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
