# Нумератор сделок - свои правила генерации Project Specification

## Назначение

`Нумератор сделок - свои правила генерации` - статическое Bitrix24 Marketplace-приложение для автоматической записи уникального номера в сделку.

## Релизная версия

- UI/runtime label: `Нумератор сделок - свои правила генерации v.8`
- Worker label: `Нумератор сделок worker v.8`
- Package version: `8.0.0`
- Marketplace zip: `dist app B24 zip/Numberer B24 v.8 Release.zip`
- Статус: версия `v.8` полностью протестирована пользователем и зафиксирована как релизная.

## Ключевые правила

- Номер записывается в пользовательское поле сделки `UF_CRM_UNIQUE_NUMBER`.
- Название поля в карточке: `Уникальный номер`.
- Старые номера не перезаписываются.
- Сделки обрабатываются только в выбранных стадиях и не раньше заданной даты начала выборки.
- Источник префикса: ручной, строковое поле сделки или без префикса.
- Разделитель после префикса: `_`, `-` или без разделителя.
- Буквенная часть включается или выключается; доступные длины: 2, 3, 4, 5.
- Цифровая часть: 3, 4, 5, 6 цифр.
- Режимы генерации: последовательный и случайный.
- Свой стартовый номер задает первое значение последовательности без префикса сделки.
- Переключатель счетчика: включен - отдельные номера на воронку; выключен - общий счетчик.
- Номера с нулевой цифровой частью не создаются.
- При пустом поле-префиксе номер не создается, а в таймлайн сделки добавляется комментарий.
- Worker продолжает активную ревизию нумерации и проверяет новые подходящие сделки с интервалом `1500ms`.

## Доступ

- Настройки может менять только администратор портала.
- Проверка выполняется через `BX24.isAdmin()` и fallback `user.admin`.

## REST-методы

- `user.admin`
- `crm.category.list`
- `crm.status.list`
- `crm.deal.fields`
- `crm.deal.userfield.list`
- `crm.deal.userfield.add`
- `crm.deal.userfield.update`
- `crm.deal.list`
- `crm.deal.update`
- `crm.timeline.comment.add`
- `crm.item.get`
- `crm.item.update`
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

Docs, tests, `.git`, `.env`, old archives and local notes are not included in the Marketplace zip.

## Проверки релиза

```powershell
npm test
npm run lint
powershell -ExecutionPolicy Bypass -File .\tools\build-marketplace-zip.ps1
```

Zip-архивы по умолчанию игнорируются. Релизный архив `Numberer B24 v.8 Release.zip` добавляется в git принудительно по явной просьбе пользователя.
