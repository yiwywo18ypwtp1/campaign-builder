# Campaign Builder

Тестовое задание: раздел «Кампании» на Next.js 16 (App Router).
Архитектура и план по фазам — [ARCHITECTURE.md](ARCHITECTURE.md).

## Запуск

Требуется Node 22 (см. `.nvmrc`).

```bash
nvm use
npm install
npm run dev        # http://localhost:3000
```

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер (Turbopack) |
| `npm run build` / `npm start` | production-сборка и запуск |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit-тесты (Vitest) |
| `npm run db:reset` | удалить SQLite-базу (пересоздаётся и засевается при следующем запуске) |

## Env

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `MOCK_LATENCY_MS` | `0` | Задержка каждого вызова mock API |
| `MOCK_FAILURE_RATE` | `0` | Доля вызовов (0..1), которые падают с 500 |
| `DATABASE_PATH` | `.data/campaign-builder.sqlite` | Путь к SQLite (`:memory:` в тестах) |

Пример: `MOCK_LATENCY_MS=500 MOCK_FAILURE_RATE=0.2 npm run dev`.

## Mock API

Данные лежат в SQLite-файле `.data/campaign-builder.sqlite` (в `.gitignore`): при первом запросе пустая база засевается
50 000 кампаний (~2 с), дальше данные переживают рестарт. `npm run db:reset` удаляет базу, следующий запуск засеет её заново.
Роль берётся из cookie `role` (`viewer` | `editor` | `admin`, по умолчанию `editor`).

| Метод | Путь | Заметки |
|---|---|---|
| GET | `/api/campaigns?cursor&limit&search&status[]&objective&owner&from&to&sort&order` | keyset-курсор, `nextCursor`, `total` |
| POST | `/api/campaigns` | `{ values, step? }` → черновик, 201 / 400 / 403 / 409 |
| GET | `/api/campaigns/:id` | `ETag: "version"` |
| PATCH | `/api/campaigns/:id` | `{ values, step? }` + `If-Match` → 428 без него, 409 при чужой версии |
| POST | `/api/campaigns/:id/status` | `{ action: "pause" \| "resume" \| "archive" }`, 403 / 422 |
| POST | `/api/campaigns/bulk` | `{ action, target: { ids } \| { filter } }` → `{ ok: [{ id, status }], failed: [{ id, reason }] }` |
| GET | `/api/campaigns/slug-available?slug=&excludeId=` | задержка 300–800 мс |
| POST | `/api/audience/estimate` | тело — `RuleGroup`, задержка 200–1500 мс |
| GET | `/api/campaigns/:id/activity?cursor` | по 20 записей |
| GET | `/api/campaigns/:id/metrics` | polling метрик |
| GET/PUT | `/api/me/preferences` | колонки, таймзона |
| GET | `/api/config` | валюты, минимумы бюджета, CTA, таймзоны |

Ошибки всегда в формате `{ error: { code, message, fieldErrors? } }`.

## Как проверить edge cases

Реализован уровень **Core**. Пункты Advanced помечены «не сделано» (причина и план — в [ARCHITECTURE.md](ARCHITECTURE.md), §11).
Адреса ниже — для `npm run dev` на `localhost:3000`. Роль переключается на `/settings` (или cookie `role`).
Если нужен чистый стенд — `npm run db:reset`.

### URL-мусор
| Что | Как проверить | Ожидание |
|---|---|---|
| `?search=%25` | открыть `/campaigns?search=%25` | поиск по литералу «%» (подстрока через `instr`, не `LIKE`), список не ломается |
| `?status[]=hack` | `/campaigns?status[]=hack` | страница: неизвестный статус отброшен, список целиком. API `/api/campaigns?status[]=hack` → **400** |
| `?cursor=garbage` | API: `curl -i "localhost:3000/api/campaigns?cursor=garbage"` | **400 `INVALID_CURSOR`**. В URL страницы курсора нет |
| `?step=unknown` | `/campaigns/new?step=unknown` | редирект на первый доступный шаг (`basics`); `/campaigns/new?step=budget` — тоже на `basics`, пока шаги не заполнены |

### Визард (создание: «New campaign» на `/campaigns`)
| Что | Как проверить | Ожидание |
|---|---|---|
| Гонка по slug | Дойти до шага Review со свободным slug (например `race-test`). В другой вкладке/терминале занять его: `curl -X POST localhost:3000/api/campaigns -H 'content-type: application/json' -d '{"values":{"name":"Other","slug":"race-test","objective":"awareness"},"step":"basics"}'`. Нажать «Schedule campaign» | возврат на шаг Basics, ошибка «This slug is already taken» у поля slug, фокус в нём |
| Смена `field` у правила | Шаг Audience: в правиле «Country» выбрать страны, затем сменить поле на «Age», потом на «Tag» | оператор и значение сбрасываются под новый тип, старых ошибок и «мусорных» ключей нет |
| Удаление группы с фокусом | Audience → «Add group», добавить в неё правило, поставить фокус в поле внутри группы, удалить группу | фокус переходит на «Add rule» родительской группы, не пропадает |
| `start` 23:30 по `America/Los_Angeles` | Шаг Budget: Timezone = `America/Los_Angeles`, Start = завтра 23:30 | шаг проходится; «Start can't be in the past» проверяется в таймзоне кампании, а не браузера. Поставить вчерашнюю дату → ошибка |
| Lifetime без `end` | Budget → тип «Lifetime», End пустой, «Next» | ошибка «End date is required…» у поля End, фокус в нём |
| `end` раньше `start` | End < Start | «End must be after start» у End |
| Dayparting `22:00–02:00` | «Add window», From 22:00, To 02:00, «Next» | «End must be after start (split overnight intervals)» у To; пересекающиеся окна — ошибка у обоих |
| 100 правил в rule builder | в `ARCHITECTURE.md` §8 описан замер; вручную — React DevTools → Profiler, печатать в одно правило | перерисовывается только оно (и блок Estimate) |

### Автосохранение, конфликты, уход со страницы
| Что | Как проверить | Ожидание |
|---|---|---|
| Автосейв | Заполнить Basics, подождать 2 с | индикатор «Draft saved», URL стал `/campaigns/{id}/edit?step=basics`, форма не перерисована |
| Восстановление черновика | Обновить страницу после автосейва / открыть «Edit» у черновика в списке | значения на месте |
| 409 при автосейве | Открыть `/campaigns/{id}/edit` черновика. В терминале сохранить его с текущей версией: `curl -X PATCH localhost:3000/api/campaigns/{id} -H 'content-type: application/json' -H 'If-Match: "1"' -d '{"values":{"name":"Elsewhere","slug":"<slug черновика>","objective":"awareness"},"step":"basics"}'` (текущая версия — в ETag `GET /api/campaigns/{id}`; для черновика, сохранённого только до Basics, это 1). Затем изменить любое поле в форме | «Changed in another window — reload to continue», новых запросов автосейва нет |
| 409 при сабмите | то же, но нажать «Schedule campaign» | сообщение «changed somewhere else… Reload», страница не падает |
| Уход со страницы | Изменить поле и сразу (< 2 с) кликнуть ссылку в шапке / «Назад» браузера / обновить вкладку | подтверждение ухода. После «Draft saved» подтверждения нет. Переходы между шагами не спрашивают |
| Закрытие вкладки с dirty-формой | Изменить поле, закрыть вкладку | нативный диалог браузера |

### Права и ошибки
| Что | Как проверить | Ожидание |
|---|---|---|
| `viewer` на `/campaigns/new` | `/settings` → Viewer, открыть `/campaigns/new` по прямой ссылке | сообщение «No access» вместо формы; в списке нет New/Edit/чекбоксов |
| `editor` архивирует | Роль Editor: на странице кампании кнопки «Archive» нет. Сервер: `curl -i -X POST localhost:3000/api/campaigns/{id}/status -H 'content-type: application/json' -H 'cookie: role=editor' -d '{"action":"archive"}'` | **403** |
| Bulk с частичными ошибками | Список: выбрать несколько строк, среди них `draft`/`finished`, «Pause» | запущенные ставятся на паузу, остальные остаются выбранными с причиной ошибки в строке |
| Откат inline-статуса | В строке нажать паузу, в другой вкладке сменить роль на Viewer (или `MOCK_FAILURE_RATE=1`) | статус сначала меняется, затем откатывается, тост с ошибкой |
| Сбои сети | `MOCK_LATENCY_MS=500 MOCK_FAILURE_RATE=0.2 npm run dev` | ошибки локальные (тост/сообщение рядом), `error.tsx` не показывается |
| Список 50k | прокрутить до конца | виртуализация, ~36 строк в DOM; возврат со страницы кампании кнопкой «← Campaigns» восстанавливает фильтры и скролл |

### Не сделано (Advanced) — для полноты списка
Загрузка 10 файлов (шаг Creatives), SSE-стрим метрик и реконнект, Archive → Undo, «выбрать все по фильтру» (bulk по фильтру
реализован в API/сервере, но не в UI), диалог 409 (в Core — сообщение). Метрики обновляются polling-ом раз в 2 с.

## Если dev-сервер перезагружает страницу по кругу

Изредка `next dev` (Turbopack) после множества горячих обновлений начинает присылать `reloadPage: "HMR hash mismatch"`, и
страница перезагружается снова и снова. Это сбой dev-кеша, не приложения (в production его нет). Лечится так:

```bash
# остановить next dev, затем
rm -rf .next && npm run dev
```
