# NEXT SESSION

## Project

- Path: `C:\AI Project B24\Numberer B24`
- App: `Нумератор сделок - свои правила генерации`
- Current release: `v.8`
- Runtime version label: `Нумератор сделок - свои правила генерации v.8`
- Worker version label: `Нумератор сделок worker v.8`
- Current release zip: `dist app B24 zip/Numberer B24 v.8 Release.zip`

## Current State

Version `v.8` is the user-tested release. It includes:

- Configurable prefix source: manual, deal string field, or no prefix.
- Configurable separator: `_`, `-`, or no separator.
- Optional letter part and configurable letter length.
- Configurable numeric length.
- Sequential and random generation modes.
- Custom start number.
- Shared counter or separate per-funnel counters.
- UI semantics: counter switch ON means separate numbers per funnel; OFF means shared counter.
- Duplicate checks scoped to the current funnel when separate numbering is enabled.
- Protection against all-zero numeric parts.
- Responsive UI layout fixes for zoomed Bitrix24 pages.
- Faster worker polling at `1500ms`.

## Important Notes

- Do not overwrite old Marketplace archives.
- Build the release archive with `tools/build-marketplace-zip.ps1`.
- Zip files are ignored by `.gitignore`; add the release zip with `git add -f`.
- Keep the release label as `v.8` unless the user asks for a new version.

## Checks

Run before push:

```powershell
npm test
npm run lint
```
