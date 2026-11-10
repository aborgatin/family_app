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

**Grammatical gender** — «Пол» (asked as the choice «Мужской» / «Женский»):
A Member's choice of masculine or feminine verb forms, used to write sentences about their actions in correct Russian («Даша добавила…»). The Member is asked their sex, which decides the verb forms; in code the term stays Grammatical gender.
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

**Description** — «Описание»:
Optional plain text under an Item's name, of any length: details, links.
_Avoid_: Note, comment, details

**Done** — «Куплено» (shopping) / «Выполнено» (todo) / «Исполнено» (wish):
The checked-off state of an Item, recorded together with who marked it done.
_Avoid_: Completed, bought, checked, finished, closed

**Visibility** — «Личный» / «Общий»:
Whether a List is Private (seen only by its Owner) or Shared (seen by all Members). Only the Owner changes it, in either direction: a List can be prepared as Private and shared later, and a Shared List made Private disappears for the other Member.
_Avoid_: Family (as a visibility), public, personal, access

**Owner** — «Владелец»:
The Member a List belongs to; the only one who sees it when it is Private, and the only one who changes its Visibility or deletes it. The other Member may still rename a Shared List and work with its Items.
_Avoid_: Author, creator (for lists)

**Creator** — «Добавил(а)»:
The Member who added an Item.
_Avoid_: Author, added by, owner (for items)

**Wish list** — «Список желаний»:
A List of kind wish; always Shared. Whose wishes it holds is said by its name («Желания Даши»), unless it is a Child list.
_Avoid_: Wishlist, gift list, registry

## Shopping

**Shopping list** — «Список покупок»:
A List of kind shopping, named after where you buy (e.g. «Супермаркет», «Аптека»); a Family can have several.
_Avoid_: Store, store type, shop, cart, basket

**Category** — «Категория»:
A group within one Shopping list (e.g. «Еда», «Бытовая химия»); its position sets the order the list is shown in, matching the walk through the store.
_Avoid_: Aisle, department, section, store type

**Unnamed category** — «Без категории» (only where Categories are edited; the Shopping list shows it with no title):
The one Category every Shopping list has without a name. It holds the Items that have no named Category, takes its place in the order like any Category, and can never be renamed or deleted.
_Avoid_: Default category, uncategorised, other

**Bought section** — «Куплено»:
The part of a Shopping list holding its Done items until someone clears them.
_Avoid_: Done section, history, archive, cart

**Clear** — «Очистить»:
Removing all Done items from a Shopping list's Bought section at once. Only a Shopping list has it: a Done todo item is kept until someone deletes it.
_Avoid_: Reset, archive, empty

**Item history** — —:
The item names remembered per Shopping list, kept after their Items are cleared; the source of autocomplete. It remembers names only: no Category, no Description. Any Member who sees the list can remove a name from it (a typo); the name comes back the next time it is used.
_Avoid_: Catalog, product database, dictionary, suggestions

## Todos

**Todo list** — «TODO-список» (as a List kind: «TODO»):
A List of kind todo. Its Items are still «Задача».
_Avoid_: Task list, checklist, tasks, «Список дел»

**Assignee** — «Ответственный»:
The Member responsible for a todo item on a Shared list; never a Child. Optional; making the list Private removes it from every item.
_Avoid_: Executor, performer, owner

**Due date** — «Срок»:
The optional day a todo item should be done by, with an optional time of day; it triggers a Reminder.
_Avoid_: Deadline, due time

**Repeat** — «Повтор»:
An optional rule (daily, weekly, monthly or yearly) that makes a todo item recur; it needs a Due date. Marking the item Done keeps it as Done and adds an open copy carrying the Repeat, due at the next occurrence counted from the old Due date and lying in the future. A Done item put back to open has no Repeat.
_Avoid_: Recurrence, recurring, schedule, cycle

## Children

**Child color** — «Цвет»:
The color a Child is shown in, picked from the fixed Child color palette. The palette is code (one list shared by the API and the web app), not Family data.
_Avoid_: Theme, tag color, label

**Child page** — «Страница ребёнка»:
The page for one Child, holding their Child profile and their Child lists. It starts with no lists; Members create, rename and delete them there as they do any List.
_Avoid_: Child dashboard, kid page

**Child list** — —:
A Todo list or Wish list that is about a Child, created on their Child page and tied to that Child for good; always Shared. Its Owner is the Member who created it, not the Child. Deleting the Child deletes it.
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
The conflict rule: when two devices change the same field of the same record, the change the server receives later is kept, whenever it was made on the device. Changes to different fields of one record are both kept. A change to a record that was deleted meanwhile is dropped: deleting wins.
_Avoid_: Merge, conflict resolution

## Future

Links (R2), recipes (R3) and trips (R4) will add their own terms when designed; a trip's packing list reuses List and Item.
