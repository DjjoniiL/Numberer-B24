# NEXT SESSION

## Project

- Path: `C:\AI Project B24\Numberer B24`
- App: `Numberer B24`
- Runtime version label: `Numberer B24 v.3.14`
- Current versioned zip: `dist app B24 zip/Numberer B24 v.3.14.zip`

## Current State

The app is a static Bitrix24 Marketplace app. It creates and fills `UF_CRM_UNIQUE_NUMBER` in deals according to admin settings.

Implemented:

- Admin-only settings.
- Non-admin notice.
- Persistent settings in `app.option`.
- Default settings on first install.
- Date cutoff by `DATE_CREATE`.
- Full renumbering of matching deals after admin save.
- Worker processing of matching unnumbered deals.
- Versioned zip build script.

## Important Rules

- Use scopes: `crm`, `placement`, `user_brief`.
- Do not use `user_basic` unless new code starts reading contacts or richer user profiles.
- Do not overwrite old Marketplace archives. Create a new versioned zip after runtime changes.
- Runtime zip must contain only browser runtime files.
- Do not commit generated Marketplace zip archives by default. Only one, maximum two, final/release zip archives may be committed/pushed, and only after the user explicitly approves pushing the zip.
- Do not push unless the user explicitly asks.

## Checks

```powershell
npm test
npm run lint
powershell -ExecutionPolicy Bypass -File .\tools\build-marketplace-zip.ps1
```

Before handing off a new build, inspect zip contents and remind the user to test on the Bitrix24 test portal.

## Pending Manual Test

1. Install/update the versioned zip on the test portal.
2. Open as non-admin and confirm settings are blocked with the admin notice.
3. Open as admin and save default settings.
4. Move a new deal into the selected successful stage and confirm `Уникальный номер`.
5. Change settings and confirm matching deals after the cutoff are renumbered.
