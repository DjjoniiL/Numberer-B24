# NEXT SESSION

## Project

- Path: `G:\AI Project B24\Numberer B24`
- App: `Нумератор сделок - свои правила генерации`
- Runtime version label: `Нумератор сделок - свои правила генерации v.4`
- Current versioned zip: `dist app B24 zip/Numberer B24 v.4.zip`

## Current State

The app is a static Bitrix24 Marketplace app. It creates and fills `UF_CRM_UNIQUE_NUMBER` in deals according to admin settings.

Version `v.4` is the final naming of the tested `v.3.18` behavior.

Implemented:

- Admin-only settings.
- Non-admin notice.
- Persistent settings in `app.option`.
- Default settings on first install.
- Date cutoff by `DATE_CREATE`.
- Numbering of matching deals with empty `UF_CRM_UNIQUE_NUMBER` after admin save.
- Preservation of existing numbers in old deals.
- Skipping deleted or unavailable deals through an additional `crm.item.get` check.
- Prefix from manual value or from selected deal field.
- Timeline comment when selected prefix field is empty.
- Custom start number mode.
- Automatic digit/letter option sync from custom start value.
- Worker processing of matching unnumbered deals.
- Toggleable logging journal with app scrolling when opened.
- Versioned zip build script.

## Important Rules

- Use scopes: `crm`, `placement`, `user_brief`.
- Do not use `user_basic` unless new code starts reading contacts or richer user profiles.
- Do not overwrite old Marketplace archives. Create a new versioned zip after runtime changes.
- Runtime zip must contain only browser runtime files.
- Do not commit generated Marketplace zip archives by default.
- Only one, maximum two, final/release zip archives may be committed/pushed, and only after the user explicitly approves pushing the zip.
- User explicitly approved pushing `Numberer B24 v.4.zip`.
- Do not push unless the user explicitly asks.

## Checks

```powershell
npm test
npm run lint
powershell -ExecutionPolicy Bypass -File .\tools\build-marketplace-zip.ps1
```

Before handing off a new build, inspect zip contents and remind the user to smoke-check the installed zip on the Bitrix24 test portal.

## Manual Test Status

User tested version `v.3.18` successfully:

- manual prefix works;
- prefix from deal field works;
- custom start number works;
- old filled values in `Уникальный номер` are preserved;
- admin/non-admin access works;
- logging journal works;
- settings persist after refresh.

Version `v.4` should be treated as the final release label for that verified behavior.
