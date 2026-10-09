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

Проверка edge cases будет описана по мере реализации фаз.

## Если dev-сервер перезагружает страницу по кругу

Изредка `next dev` (Turbopack) после множества горячих обновлений начинает присылать `reloadPage: "HMR hash mismatch"`, и
страница перезагружается снова и снова. Это сбой dev-кеша, не приложения (в production его нет). Лечится так:

```bash
# остановить next dev, затем
rm -rf .next && npm run dev
```
