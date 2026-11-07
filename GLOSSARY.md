# Family App

A private app for one family: shopping lists, todos, wish lists and children's pages, used by the adults of the family.
Canonical names are English (code, API, tickets); the UI is Russian only, so each term also gives its Russian UI label.

Format: **Term** — UI label «…». "—" means the term never appears in the UI.

## Family & people

**Family** — «Семья»:
The single family served by one installation of the app.
_Avoid_: Tenant, household, account

**Member** — «Взрослый» (plural «Взрослые»):
An adult of the Family who has a login and uses the app.
_Avoid_: User, parent, adult, account, family member (in Russian «член семьи» also suggests children)

**Grammatical gender** — — (asked as the choice «Добавил» / «Добавила»):
A Member's choice of masculine or feminine verb forms, used to write sentences about their actions in correct Russian («Даша добавила…»).
_Avoid_: Gender, sex

**Child** — «Ребёнок» (plural «Дети»):
A child of the Family, represented as a profile without a login.
_Avoid_: Kid, daughter, dependent, child user

**Invite** — «Приглашение»:
A link a Member sends to another adult so they can register and become a Member.
_Avoid_: Invitation code, referral, share link

**Password reset** — «Сброс пароля»:
A one-time link, created by the operator's server command, with which a Member who forgot their password sets a new one; using it logs the Member out on every other device.
_Avoid_: Password recovery, forgot-password token, reset code

## Lists & items

**List** — «Список»:
A named collection of Items of one List kind.
_Avoid_: Checklist, board, collection

**List kind** — —:
What a List is for: shopping, todo or wish. Fixed in code, not configurable.
_Avoid_: List type, template, mode

**Item** — «Товар» (shopping) / «Задача» (todo) / «Желание» (wish):
One entry in a List. Say "shopping item", "todo item" or "wish item" when the kind matters.
_Avoid_: Task, product, wish, entry, todo (as a noun for an item)

**Done** — «Куплено» (shopping) / «Выполнено» (todo) / «Исполнено» (wish):
The checked-off state of an Item, recorded together with who marked it done.
_Avoid_: Completed, bought, checked, finished, closed

**Visibility** — «Личный» / «Общий»:
Whether a List is Private (seen only by its Owner) or Shared (seen by all Members).
_Avoid_: Family (as a visibility), public, personal, access

**Owner** — «Владелец»:
The Member a List belongs to; the only one who sees it when it is Private.
_Avoid_: Author, creator (for lists)

**Creator** — «Добавил(а)»:
The Member who added an Item.
_Avoid_: Author, added by, owner (for items)

**Wish list** — «Список желаний»:
A List of kind wish, kept for a Member or a Child; always Shared.
_Avoid_: Wishlist, gift list, registry

## Shopping

**Shopping list** — «Список покупок»:
A List of kind shopping, named after where you buy (e.g. «Супермаркет», «Аптека»); a Family can have several.
_Avoid_: Store, store type, shop, cart, basket

**Category** — «Категория»:
A group within one Shopping list (e.g. vegetables → dairy → bread); its position sets the order the list is shown in, matching the walk through the store.
_Avoid_: Aisle, department, section, store type

**Bought section** — «Куплено»:
The part of a Shopping list holding its Done items until someone clears them.
_Avoid_: Done section, history, archive, cart

**Clear** — «Очистить»:
Removing all Done items from a Shopping list's Bought section at once.
_Avoid_: Reset, archive, empty

**Item history** — —:
The item names remembered per Shopping list, each with the Category it last had; the source of autocomplete and auto-categorisation.
_Avoid_: Catalog, product database, dictionary, suggestions

## Todos

**Todo list** — «Список дел»:
A List of kind todo.
_Avoid_: Task list, checklist, tasks

**Assignee** — «Ответственный»:
The Member responsible for a todo item on a Shared list; never a Child.
_Avoid_: Executor, performer, owner

**Due date** — «Срок»:
The optional moment a todo item should be done by; it triggers a Reminder.
_Avoid_: Deadline, due time

**Repeat** — «Повтор»:
An optional rule (daily, weekly, monthly or yearly) that makes a todo item recur.
_Avoid_: Recurrence, recurring, schedule, cycle

## Children

**Child color** — «Цвет»:
The color a Child is shown in, picked from the fixed Child color palette. The palette is code (one list shared by the API and the web app), not Family data.
_Avoid_: Theme, tag color, label

**Child page** — «Страница ребёнка»:
The page for one Child, holding their Child profile, Todo list and Wish list.
_Avoid_: Child dashboard, kid page

**Child list** — —:
A Todo list or Wish list that is about a Child; always Shared, and the Child is not its Owner.
_Avoid_: Child's own list, kid list

**Child profile** — «Профиль»:
The card on a Child page showing that Child's value for every Child field.
_Avoid_: Profile card, child card, child info

**Child field** — «Поле профиля»:
A field the Family defines once in Settings (shoe size, allergies, teacher's phone, …) that every Child profile has; each Child has their own value for it.
_Avoid_: Custom field, attribute, property, profile field

**Value type** — «Тип» («Текст» / «Дата»):
What kind of value a Child field holds; chosen when the field is created and never changed. Fixed in code, not configurable.
_Avoid_: Field type, data type, format

## Settings

**Settings** — «Настройки»:
The screen, available to every Member, where the Family edits Members, Children and Child fields.
_Avoid_: Admin, admin panel, configuration

**Defaults** — —:
The Russian starter set (Shopping lists with Categories, Child fields) a fresh installation is seeded with.
_Avoid_: Seed, fixtures, presets

## Notifications

**Notification** — «Уведомление»:
A push message telling a Member about another Member's change to a Shared list; never sent for one's own changes.
_Avoid_: Alert, push, message, reminder

**Reminder** — «Напоминание»:
A push message telling a Member that a todo item's Due date has arrived.
_Avoid_: Notification, alert, due notification

**Batch** — —:
Several changes by one Member to one List combined into a single Notification ("Даша добавила 7 товаров в Супермаркет").
_Avoid_: Digest, summary, bundle

**Mute** — «Без уведомлений»:
A Member's choice to get no Notifications for one List; Reminders still arrive.
_Avoid_: Unsubscribe, silence, snooze

**Notifications switch** — «Уведомления»:
A Member's global on/off for all push messages, Notifications and Reminders alike.
_Avoid_: Do not disturb, push setting

## Sync

**Outbox** — —:
The queue of changes made on a device that the server has not yet accepted.
_Avoid_: Queue, pending changes, offline cache

**Version** — —:
A server-assigned, ever-increasing number stamped on every changed record; devices pull "everything since version N".
_Avoid_: Revision, timestamp, sequence

**Last write wins** — —:
The conflict rule: when two devices change the same field of the same record, the later change is kept.
_Avoid_: Merge, conflict resolution

## Future

Links (R2), recipes (R3) and trips (R4) will add their own terms when designed; a trip's packing list reuses List and Item.
