# Numberer B24 Project Specification

## Назначение

Static Bitrix24 Marketplace-приложение для автоматической записи уникального номера в сделки.

## Текущая версия

- UI/runtime label: `Numberer B24 v.3.5`
- Marketplace zip: `dist app B24 zip/Numberer B24 v.3.5.zip`

## Основные правила

- Номер записывается в пользовательское поле сделки `UF_CRM_UNIQUE_NUMBER`.
- Название поля в карточке: `Уникальный номер`.
- Формат номера: `PREFIX_AAA0001`.
- Разделитель `_` автоматически ставится между префиксом и буквенной частью, если префикс не заканчивается на `_` или `-`.
- Префикс берется из ручной настройки или из выбранного строкового поля сделки.
- Цифровая часть: 3, 4, 5 или 6 символов.
- Буквенная часть: 2, 3, 4 или 5 латинских букв.
- Режимы: последовательный и случайный.
- Дата начала выборки ограничивает обработку сделок по `DATE_CREATE >= startDate`.
- При сохранении администратором создается ревизия перенумерации: вся подходящая выборка перенумеровывается заново, включая сделки с уже заполненным номером.
- Фоновый worker продолжает активную ревизию перенумерации для уже существующих сделок и отдельно обрабатывает новые подходящие сделки без номера.

## Доступ

- Изменять настройки может только администратор портала.
- Для проверки используется `BX24.isAdmin()` и fallback `user.admin`.
- Неадминистратор видит сообщение: «Для изменения настроек обратитесь к администратору вашего портала.»

## Настройки по умолчанию

- Префикс: ручной.
- Ручной префикс: `NUM`.
- Цифровая часть: 4 символа.
- Буквенная часть: 2 символа.
- Режим: последовательный.
- Дата начала выборки: дата установки минус 14 дней.
- Стадия по всем воронкам: успешная стадия.

## Права Bitrix24

Минимальные scope:

- `crm`
- `placement`
- `user_brief`

`user_brief` достаточно, потому что приложение не читает профили пользователей, контакты, e-mail или телефоны. Пользовательский scope нужен только для проверки административного доступа через `user.admin`, если `BX24.isAdmin()` недоступен.

## REST-методы

- `user.admin`
- `crm.category.list`
- `crm.status.list`
- `crm.deal.fields`
- `crm.deal.userfield.list`
- `crm.deal.userfield.add`
- `crm.deal.userfield.update`
- `crm.deal.get`
- `crm.deal.list`
- `crm.deal.update`
- `crm.item.details.configuration.get`
- `crm.item.details.configuration.set`
- `crm.deal.details.configuration.get`
- `crm.deal.details.configuration.set`
- `app.option.get`
- `app.option.set`
- `placement.bind`
- `placement.unbind`

## Runtime files inside zip

- `install.html`
- `install.js`
- `index.html`
- `app.js`
- `numbering-core.js`
- `style.css`
- `worker.html`
- `worker.js`
- `worker-error.html`

Docs, tests, `.git`, `.env`, old archives and local notes must not be included in Marketplace zip.
