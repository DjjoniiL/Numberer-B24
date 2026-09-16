# Numberer B24

Static Bitrix24 Marketplace app for assigning unique numbers to deals.

Current runtime label: `Numberer B24 v.2.0`.

Current Marketplace archive naming format: `dist app B24 zip/Numberer B24 v.2.0.zip`.

## What it does

- Loads all deal funnels through `crm.category.list`.
- Lets the user pick the deal stage where a number must be created for each funnel.
- Allows settings changes only for Bitrix24 administrators.
- Creates the deal string field `Уникальный номер` (`UF_CRM_UNIQUE_NUMBER`) automatically on install, app load, and save.
- Puts that field into the main deal-card section.
- Builds numbers in the format `PREFIX_AAA0001`.
- Supports prefix from an existing string deal field or a manual prefix.
- Refreshes the string-field list from CRM when the refresh button is pressed.
- Supports `Дата начала выборки`: only deals with `DATE_CREATE` on or after this date receive numbers.
- Supports 3, 4, 5, or 6 numeric digits.
- Supports 2, 3, 4, or 5 Latin letters in the generated letter prefix.
- Supports sequential and random modes.
- Default settings after install: manual prefix `NUM`, 3 digits, 2 letters, sequential mode, successful stage for every funnel, and start date set to 14 days before install.
- Saves settings permanently in `app.option`; install and app load preserve existing settings.
- Renumbers every matching deal after an administrator saves settings, including deals that already have a unique number.
- The background worker continues processing matching deals with an empty number while Bitrix24 runs the app worker.
- Includes help modals with capacity examples such as `26^4 = 456 976`.

## Marketplace files

Runtime files:

- `install.html`
- `install.js`
- `index.html`
- `app.js`
- `numbering-core.js`
- `style.css`
- `worker.html`
- `worker.js`
- `worker-error.html`

Do not put `.env`, secrets, repository metadata, tests, docs, or local notes into the Marketplace zip.

## Bitrix24 scopes

Use the narrowest scopes:

- `crm`
- `placement`
- `user_brief`

`user_brief` is enough because the app only checks whether the current user can manage app settings through `BX24.isAdmin()` / `user.admin`. It does not call `user.get`, does not read contacts, and does not need `user_basic`.

## Bitrix24 REST methods

Minimal app permissions should cover CRM read/write, user fields, app options, and placements:

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

## Local checks

```powershell
npm test
npm run lint
powershell -ExecutionPolicy Bypass -File .\tools\build-marketplace-zip.ps1
```

The build script writes a versioned archive into `dist app B24 zip`. If the target archive already exists, the script creates a timestamped file instead of overwriting it.
