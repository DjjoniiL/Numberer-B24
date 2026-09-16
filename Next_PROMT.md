# Next Prompt

Проект: `C:\AI Project B24\Numberer B24`.

Приложение: Bitrix24 Marketplace static app `Numberer B24`, runtime label `Numberer B24 v.2.0`.

Текущий zip должен быть versioned: `dist app B24 zip/Numberer B24 v.2.0.zip`. Не перезаписывать уже созданные архивы; после runtime-изменений поднять версию и собрать новый zip.

Ключевое поведение:

- Scope: `crm`, `placement`, `user_brief`.
- Настройки меняют только администраторы через `BX24.isAdmin()` / `user.admin`.
- Неадмин видит строку: «Для изменения настроек обратитесь к администратору вашего портала.»
- Настройки сохраняются в `app.option` и не сбрасываются при открытии/обновлении.
- Дефолты: ручной prefix `NUM`, 3 цифры, 2 буквы, последовательный режим, дата выборки минус 14 дней от установки, успешная стадия во всех воронках.
- При сохранении админом перенумеровываются все подходящие сделки по стадии и `DATE_CREATE`, включая ранее заполненные.
- Worker обрабатывает только подходящие сделки без номера.

Проверки:

```powershell
npm test
npm run lint
powershell -ExecutionPolicy Bypass -File .\tools\build-marketplace-zip.ps1
```

Не делать `git push`, пока пользователь явно не попросит.
