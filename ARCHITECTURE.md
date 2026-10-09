# Campaign Builder — архитектура

Живой документ: обновляется после каждой фазы. Объём работы — уровень **Core** тестового задания.
Advanced и Bonus не реализуются,
пока об этом явно не попросят.

## 1. Принципы и ограничения

1. **Простота важнее «enterprise»-слоёв.** Никаких repository/service/ORM-абстракций, фабрик, DI,
   generic-утилит и своих мини-фреймворков без конкретной проблемы из задания.
2. **Хранилище — SQLite через better-sqlite3** и обычные функции с SQL-запросами. Без ORM, repository и service-слоёв.
3. **URL-состояние — минимально.** Native History API используется только там, где нужно (список и визард),
   локально в этих фичах. Generic-фреймворка для URL-состояния нет.
4. **Dirty guard — изолированная забота о навигации браузера** внутри визарда, тестируется отдельно.
   Никакой общей «навигационной» абстракции.
5. **Без преждевременной оптимизации.** `memo` / `useCallback` / `useMemo` / свои хуки — только когда они
   решают конкретную проблему задачи (каждый случай описан ниже).
6. **Server Components по умолчанию**, клиентские компоненты — только интерактивные листья.
7. **Ошибки обрабатываются локально**, если их можно обработать; `error.tsx` — только для неожиданных.
8. **Права проверяются на сервере**; на клиенте роль используется только чтобы скрыть/задизейблить UI.

## 2. Стек

| Что | Выбор | Почему |
|---|---|---|
| Runtime | Node 22 (`.nvmrc`, `engines`) | Next 16 / shadcn / Vitest 5 требуют Node ≥ 20.19 / 22 |
| Фреймворк | Next.js 16.4 (App Router, Turbopack), React 19.3, TS `strict` | Требование «Next 15+» |
| UI | Tailwind 4 + shadcn/ui (стиль `radix-nova`, Radix), sonner для тостов | Доступные примитивы, код лежит в репо, нет runtime-обёрток |
| Формы | React Hook Form + zod 4 + `@hookform/resolvers` | Требование задания |
| Таблица | `@tanstack/react-table` **v9** + `@tanstack/react-virtual` v3 | Требование задания |
| Серверное состояние на клиенте | `@tanstack/react-query` — **только список и polling метрик** | См. D1 |
| БД (mock) | SQLite, `better-sqlite3`, чистый SQL | Данные переживают рестарт, UNIQUE для slug, атомарная проверка версии. См. D15 |
| Таймзоны | `date-fns` + `@date-fns/tz` | Перевод wall-time → момент с DST вручную не пишем |
| График | Inline SVG | 60 точек; библиотека не нужна |
| Тесты | Vitest 5 (среда node) | Unit-тесты схем, URL-параметров, денег, курсора (Core) |

## 3. Допущения

1. **Хранилище:** файл SQLite во временной папке ОС (`$TMPDIR/campaign-builder/`, вне проекта — см. фазу 4). Пустая база засевается
   50k кампаний из фиксированного seed при первом обращении; данные переживают рестарт. `npm run db:reset` — пересоздать.
2. **Пользователь:** один текущий (`u_me`), роль в cookie `role`, по умолчанию `editor`.
3. **Время в расписании** хранится как ISO-wall-time в таймзоне кампании (`2026-10-10T23:30`) + `timezone`.
4. **Ночной интервал dayparting** (`22:00–02:00`) — ошибка «разбейте на два интервала».
5. **«> 50 правил»** — больше 50 прямых детей одной группы.
6. **Финальный сабмит:** `draft → scheduled`. Автосейв статус не меняет.
7. **Колонки:** URL главнее; если в URL нет — берутся из серверных preferences.
8. **Мусор в URL:** невалидные значения отбрасываются; `?step=unknown` → первый доступный шаг;
   API на `cursor=garbage` → `400 INVALID_CURSOR`; в URL страницы курсора нет.
9. **409 в Core:** локальное состояние ошибки «Кампания изменена — перезагрузите» (диалог — Advanced).
10. **Viewer на `/campaigns/new`:** сервер рендерит сообщение «Нет доступа» (без экспериментального `forbidden()`).

## 4. Структура

```
src/
  app/               роутинг: тонкие страницы, layouts, route handlers (api/…)
  features/
    campaigns/
      schemas.ts     единые zod-схемы клиента и сервера
      types.ts       типы через z.infer + серверные поля
      actions.ts     'use server' — тонкие адаптеры над src/server
      list/          таблица, фильтры, list-params.ts (parse/serialize URL)
      wizard/        визард, шаги, rule-builder/, автосейв, dirty guard
      detail/        метрики, статус, activity, read-only дерево правил
    settings/        роль, таймзона, колонки
  server/            'server-only': store, session, campaigns, preferences, activity, metrics, config, mock
  lib/               чистый общий код: permissions, money, result (Result + формат ошибки), fetch-json
  components/ui/     примитивы shadcn
```

- `app/` — роутинг; `features/` — UI и код конкретной фичи; `server/` — единственное место, которое знает
  про «БД»; `lib/` — чистые хелперы для обеих сторон.

## 5. Потоки данных

| Что | Механизм |
|---|---|
| Чтение для страниц | Server Components вызывают `src/server/*` напрямую |
| Чтение с клиента (список, slug, estimate, метрики, activity) | Route Handlers (GET) + `fetch` с `AbortSignal` |
| Мутации из UI | Server Actions → `Result<T>` с единым форматом ошибки |
| Мутирующие Route Handlers | Существуют по контракту API; вызывают те же функции `src/server` |
| Состояние формы | RHF, один `FormProvider` на визард |
| Фильтры/сортировка/колонки | URL — источник истины |
| Шаг визарда | URL `?step=` |
| Загруженные страницы списка + скролл | Кеш React Query + offset в `sessionStorage` |

Форма:

```
RHF values ─(подписка без ре-рендера)─► автосейв: dirty? → debounce 2s → safeParse схемы шага (молча)
  → saveDraftAction(id, values, version) → сервер: роль → валидация → version → запись
  → новый version → reset(snapshot, { keepValues: true }) → «Saved»
Сабмит: handleSubmit → submitCampaignAction → fieldErrors → setError(path) → шаг → фокус
```

## 6. Server / Client

| Компонент | Сторона | Почему |
|---|---|---|
| `page.tsx`, layouts, `generateMetadata`, `not-found` | Server | Данные, роль, редиректы |
| `error.tsx` | Client | Требование Next.js |
| `CampaignsView` (фильтры + таблица) | Client | Виртуализация, скролл, URL, выбор строк |
| Шапка кампании, бюджет, `RuleTreeView`, креативы | Server | Read-only, 0 JS |
| `StatusActions` | Client | `useOptimistic` + Server Action |
| `LiveMetrics` + `SpendChart` | Client | Polling; перерисовывается только этот лист |
| `ActivityLog` | Client | Первая страница с сервера, «загрузить ещё» на клиенте |
| `CampaignWizard` и всё внутри | Client | RHF; данные приходят пропсами с сервера |
| `RoleSwitcher`, `PreferencesForm` | Client | Формы, вызывают Server Actions |

## 7. Ключевые решения

Формат: **зачем** / **простая альтернатива** / **почему не она**.

- **D1. React Query только для списка (и polling метрик).** Нужны кеш страниц, переживающий навигацию
  (возврат к списку), infinite-пагинация, отмена через `signal`, оптимистичные правки с откатом /
  `useState + fetch` / при размонтировании всё теряется, пришлось бы писать свой кеш.
- **D2. Один серверный модуль для Route Handlers и Server Actions.** Правила прав, валидации, версий и
  переходов статусов не дублируются / логика внутри каждого handler и action / дубли и неполное покрытие 403.
  Это обычные функции, а не сервис-классы.
- **D3. URL списка и шага визарда — через `history.replaceState/pushState`**, локально в этих фичах.
  Иначе каждый ввод в фильтр перезапрашивает RSC payload / `router.replace` / лишние запросы на сервер.
- **D4. Свои `parseListParams` / `serializeListParams` на zod.** Отбросить мусор и покрыть тестами /
  `nuqs` / лишняя зависимость ради ~60 строк, которые всё равно нужно тестировать.
- **D5. Keyset-курсор** `{ sortValue, id }` в base64url. Стабилен при вставках / offset в «курсоре» /
  это offset-пагинация под другим именем.
- **D6. `buildCampaignSchema(config)`.** Минимумы бюджета приходят с сервера / константы в схеме /
  нарушает требование. Одна функция для клиента и сервера — источник схемы один.
- **D7. Slug и estimate: явный `AbortController` + `Map`-кеш + номер запроса.** Отмена и защита от
  устаревших ответов видны в коде / `useQuery` / работает, но спрятано в библиотеке.
- **D8. Уникальность slug — вне zod-схемы.** Resolver вызывается на каждое изменение / async refine /
  спам запросами. Окончательно решает сервер (409 → `setError('slug')`).
- **D9. Автосейв проверяет шаг молча (`safeParse`)**, сохранения строго по одному, `version` вне значений
  формы / `trigger()` / показывает ошибки на ещё не заполненных полях.
- **D10. Rule builder:** `useFieldArray` на группу, `key={field.id}`, `useWatch` только своего `field`,
  при смене `field` правило заменяется целиком. `memo` — только если Profiler покажет проблему.
- **D11. Dirty guard:** `beforeunload` + capture-клик по `<a>` + `popstate` для «назад», всё через
  `window.confirm`. В App Router нет API блокировки навигации. Изолирован внутри визарда.
- **D12. Права:** `can(role, action)` в `lib/permissions.ts`; сервер возвращает 403, клиент только скрывает/дизейблит.
- **D13. Серверного кеша нет (осознанно).** Данные в памяти, страницы зависят от cookie роли, список часто
  меняется. После мутаций — `revalidatePath`. С реальной БД: `'use cache'` + `cacheTag` + `updateTag`.
  Поэтому `cacheComponents` и `partialPrefetching`, которые шаблон Next 16.4 включает по умолчанию,
  **выключены** в `next.config.ts`. Компромисс: с `cacheComponents` Next прячет предыдущие страницы через
  React `<Activity>` и сохраняет их состояние/скролл, но тогда каждое чтение cookie (роль) нужно
  оборачивать в `<Suspense>`. Восстановление списка делаем явно (React Query + `sessionStorage`).
- **D15. SQLite вместо объектов в памяти.** Данные (и черновики) переживают рестарт; уникальность slug держит
  `UNIQUE` (гонка невозможна); проверка версии атомарна (`UPDATE … WHERE id = ? AND version = ?`); keyset —
  настоящий SQL `(sort_value, id) > (?, ?)` / объекты в `Map` / всё это пришлось бы эмулировать вручную.
  Вложенные структуры (audience, budget, schedule, creatives) — JSON-колонки; поля для фильтров/сортировки
  вынуты из JSON **сгенерированными колонками** (`GENERATED ALWAYS AS … STORED`), так что запись их не дублирует.
- **D14. Ошибки локально:** `Result` / `ApiError` → сообщение рядом или тост. Имитация сбоев
  (`MOCK_FAILURE_RATE`) — в route handlers и actions, не в чтении для RSC.

### Где `useMemo`/хуки обоснованы

- `useMemo` на `pages.flatMap(...)` в списке: TanStack Table требует стабильной ссылки на `data`.
- `useDebouncedValue` (~8 строк): используется в поиске, slug и estimate.
- Всё остальное — только после замера.

## 8. Чувствительно к производительности

1. Список 50k: виртуализация, страницы по 100, стабильный `data`, колонки на уровне модуля, ширины через
   CSS-переменные, `columnResizeMode: 'onEnd'`.
2. Ввод в rule builder (D10).
3. Метрики: обновляется только `LiveMetrics`.
4. Сеть: debounce + отмена; автосейв последовательный.

Как измеряли:
- **Список** (фаза 4): headless Chrome (playwright-core) против `next build && next start`. Скрипт догружает страницы,
  прокручивая контейнер до конца, затем 3 с крутит его по `requestAnimationFrame` (40 и 400 px за кадр) и считает
  кадры; параллельно `PerformanceObserver({ type: "longtask" })` ловит задачи > 50 мс.
  Результат: при 4 101 и при 26 101 загруженной строке — 60 fps, p95 кадра 17 мс, **0 long tasks** и при догрузке,
  и при прокрутке; в DOM всегда ~36 строк. Вручную: React DevTools → Profiler, «Highlight updates» при скролле.
- Метрики (фаза 5) и rule builder (фаза 7) — будет дописано.

## 9. От чего отказались

- Redux / Zustand / Context-сторы — URL + RHF + React Query покрывают всё.
- Repository/service-классы, DI, ORM (Drizzle/Prisma) — четыре таблицы, обычные функции с SQL.
- `node:sqlite` — встроен в Node 22, но ещё экспериментальный; better-sqlite3 стабилен и Next по умолчанию выносит его из бандла.
- tRPC / сгенерированный клиент — Server Actions уже типизированы.
- Generic `<DataTable>` / `<Form*>`, generic URL-state — один список, один визард.
- XState / машина состояний визарда — шаг это параметр URL.
- `nuqs`, библиотеки графиков, визардов, rule builder.
- `memo` / `useCallback` по умолчанию.
- `proxy` (бывший middleware), i18n, feature flags — не нужны в Core.

## 10. План по фазам

| # | Фаза | Готово, когда | Статус |
|---|---|---|---|
| 0 | Каркас: Next 16, TS strict, Tailwind, ESLint, Vitest, shadcn, зависимости, git + origin | Приложение собирается, тесты запускаются | ✅ |
| 1 | Домен и схемы, permissions, money, Result | Unit-тесты зелёные; решена типизация путей RHF для рекурсивного дерева | ✅ |
| 2 | Mock-сервер и route handlers | Эндпоинты отвечают (включая 400/403/409/428); тесты курсора | ✅ |
| 3 | Настройки (роль, таймзона, колонки) | Смена роли меняет серверные 403 | ✅ |
| 4 | Список | Edge cases списка, замер скролла | ✅ |
| 5 | Страница кампании | Тики метрик не перерисовывают страницу | ⏳ |
| 6 | Каркас визарда + Basics | Редиректы недоступных шагов | ⏳ |
| 7 | Audience (rule builder 2 уровня + estimate) | Profiler: ввод в правило перерисовывает только его | ⏳ |
| 8 | Budget & Schedule | Кейсы таймзоны и lifetime без end | ⏳ |
| 9 | Review и сабмит | 409 slug мапится на поле | ⏳ |
| 10 | Автосейв + dirty guard | Восстановление черновика, подтверждение ухода | ⏳ |
| 11 | README + финальный ARCHITECTURE | Core готов к сдаче | ⏳ |

После каждой фазы — отчёт; коммит и пуш — по команде.

## 11. Журнал фаз

### Фаза 0 — каркас
- `create-next-app@16.4.0` (TS, Tailwind 4, ESLint flat config, `src/`, alias `@/*`), shadcn init (Radix, Nova).
- Установлены: zod 4, react-hook-form, @hookform/resolvers, @tanstack/react-table v9, react-virtual,
  react-query v5, date-fns + @date-fns/tz, server-only, Vitest 5.
- Скрипты: `dev`, `build`, `lint`, `typecheck` (`next typegen && tsc`), `test`.
- Находки:
  - Шаблон включает `cacheComponents` / `partialPrefetching` — выключены (см. D13).
  - Node 20.13 ниже требований части пакетов → проект закреплён на Node 22.
  - TanStack Table теперь v9 — API отличается от v8; в фазе 4 сверяемся с документацией v9.
  - `npm audit`: 5 high в `braces` (dev-цепочка ESLint); `audit fix --force` откатил бы
    `eslint-config-next` до 14 — не применяем.
  - `AGENTS.md` генерирует и поддерживает `next dev` (ссылка на документацию в `node_modules/next/dist/docs`).

### Фаза 1 — домен и схемы
- `features/campaigns/schemas.ts`: правила (discriminated union по `field`), рекурсивная `RuleGroup`
  (getter в zod 4), бюджет (union по `type`), расписание, `buildCampaignSchemas(config)` →
  `{ campaign, steps: { basics, audience, budget } }`.
- `features/campaigns/types.ts`: типы через `z.infer` + серверные поля `Campaign`.
- `lib/money.ts`, `lib/permissions.ts`, `lib/result.ts` (`Result<T>`, `ApiErrorBody`, `toFieldErrors`).
- Тесты: 44 unit-теста (схемы, деньги, права), включая кейс «23:30 по Лос-Анджелесу» с замороженным временем.
- Решения и находки:
  - **Типизация путей RHF для рекурсивного дерева.** `FieldPath` из RHF обрывает рекурсию: доступны только
    `audience.children.${number}.*`, а `audience.children.0.children.1.op` — нет. Решение для фазы 7:
    дерево самоподобное, у `<любая группа>.children` тот же тип, что у `audience.children`, поэтому
    rule builder получает путь строкой и приводит его к `"audience.children"` / `` `audience.children.${number}` ``
    в одном месте. Типы значений остаются точными, «врёт» только литерал пути.
    Альтернатива — плоское хранение дерева (`id → node`) — усложнила бы форму и сериализацию.
  - Схема собирается из `shape`-объектов, а не через `.extend()`: шаги и полная схема используют одни и те же
    поля и одну функцию кросс-проверок `checkBudgetAndSchedule`.
  - `dayparting` в форме — всегда массив (пустой = без ограничений), а не `optional`: `useFieldArray` проще
    работать с массивом. Отличие от модели задания осознанное.
  - Неизвестные ключи zod отбрасывает (`z.object` strip) — «мусорных» ключей после смены `field` в данных нет.
  - Валюты: все поддерживаемые имеют 2 минорных знака; минимум — один на валюту (из `config`).
  - Креативы (шаг 4, Advanced) не входят в схему формы Core; на сервере хранятся в `Campaign.creatives`.
  - `vitest.config.mts` (ESM), иначе Vite 8 предупреждает о загрузке ESM как CommonJS.

### Фаза 2 — mock-сервер и API
- `server/`: `db` (SQLite: схема, подключение на `globalThis`, засев), `seed` (50k, PRNG с seed 42), `session` (роль из cookie),
  `campaigns` (вся логика кампаний), `activity`, `metrics`, `audience` (estimate), `preferences`, `config`,
  `cursor`, `mock`, `http`. Route handlers в `app/api/**` — тонкие: HTTP ↔ функции `server/`.
- Общие с клиентом модули: `features/campaigns/list-query.ts` (параметры списка, тип строки),
  `features/campaigns/status.ts` (переходы статусов), `features/settings/preferences.ts`.
- Тесты: 72 (добавлены keyset-пагинация, версии, права, переходы, bulk, activity, метрики, estimate).
- Решения:
  - **Функции `server/` принимают пользователя параметром**, а не читают cookie сами: их легко тестировать,
    а чтение cookie остаётся в адаптерах (route handler / action).
  - **Сохранение черновика по шагам.** Валидируются шаги до текущего включительно, и в кампанию мержатся
    *только распарсенные данные этих шагов*; данные более поздних шагов от клиента игнорируются
    (остаются серверные). Непроверенные данные в «БД» не попадают, вторая «черновая» схема не нужна.
    Не-черновики сохраняются только полностью валидными.
  - **Keyset-курсор** `{ sort, order, value, id }`: курсор от другой сортировки → `400 INVALID_CURSOR`.
    Тест проверяет, что вставка кампании между страницами не даёт дублей и пропусков.
  - **API строгий** (`?status[]=hack` → 400). Мягкий разбор URL страницы (мусор отбрасывается) — фаза 4.
  - Коды: конфликт версии → **409** (и для action, и для PATCH), нет `If-Match` → **428**,
    недопустимый переход статуса → **422**, занятый slug → **409** с `fieldErrors.slug`.
  - Сортировка: `start`/`end` — по wall-time (как в таблице), «без end» — в конце при `asc`;
    `budget` — по сумме без конвертации валют.
  - Добавлен `GET /api/campaigns/:id/metrics` для polling (в таблице задания есть только SSE-стрим, это Advanced).
  - Preferences может менять любая роль: это личные настройки, а не данные кампаний.
  - В тестах `server-only` подменяется своим же пустым модулем (`node_modules/server-only/empty.js`).
- Не сделано (Advanced): `POST /api/uploads`, SSE-стрим, `editableFields`, смена владельца.
  Известное ограничение: admin не сможет сохранить running-кампанию, пока `start` в прошлом —
  это решается `editableFields` (start read-only → проверка «не в прошлом» не применяется).
- **Переезд на SQLite** (по решению на ревью фазы 2, см. D15): публичные функции `server/` сохранили сигнатуры,
  поэтому тесты фазы 2 стали проверкой переезда. Таблицы: `users`, `campaigns`, `activity`, `preferences`.
  Тесты используют `DATABASE_PATH=:memory:` (своя база на каждый тестовый файл).
  Тест activity нашёл баг генератора: `createdAt` будущих кампаний мог оказаться в будущем — исправлено.
- Замеры (`curl`, dev-сервер, M-серия Mac, 50k строк):
  - засев пустой базы — ~1.7 с, один раз (файл ~70 МБ);
  - список, сортировка по умолчанию (`updated_at`, есть индекс) — ~6 мс;
  - сортировка по name / owner / end, фильтр + поиск, следующая страница по курсору — 20–40 мс;
  - bulk по фильтру на ~16.5k кампаний (чтение + запись + activity на каждую, одна транзакция) — ~1.2 с.
  Дополнительные индексы не добавлены: без них запросы укладываются в 40 мс.

### Фаза 3 — настройки
- `app/settings/page.tsx` (Server Component) читает роль и preferences напрямую; клиентские только две формы:
  `RoleSwitcher` и `PreferencesForm`. Шапка с навигацией и ролью — в root layout (Server), подсветка активной
  ссылки — маленький клиентский `NavLink` (нужен `usePathname`).
- Server Actions `features/settings/actions.ts`: `setRoleAction` (cookie `role`, `httpOnly`) и
  `savePreferencesAction`. Аргументы валидируются на сервере: action — публичный эндпоинт.
  После изменения — `revalidatePath("/", "layout")`: роль влияет на все страницы.
- Решения:
  - **Смена роли через `useOptimistic` + `useTransition`.** Радио сразу показывает новую роль; когда transition
    заканчивается, значение берётся из пропса — новое при успехе, старое при ошибке. Ручного отката нет /
    `useState` + откат в `catch` / больше кода и легко забыть откат.
  - **Форма preferences — RHF + `zodResolver(preferencesSchema)`**, та же схема проверяет и сервер.
    Ошибки сервера: `fieldErrors` → `setError(path)`, общее сообщение → `root.server`.
    После успеха `reset(saved)` — сохранённые значения становятся «чистым» состоянием (кнопка неактивна).
  - В Core в настройках колонок — только видимость; порядок (drag-n-drop) — Advanced, ширины задаются в таблице.
  - Шрифт: шаблон shadcn ждёт `--font-sans`, а layout задавал `--font-geist-sans` — переменная выровнена.
  - Radix `SelectValue` не знает подпись выбранного пункта при SSR → значение «мигало» пустым до гидратации;
    подпись передаётся явно (`<SelectValue>{value}</SelectValue>`).
- Проверено в headless Chrome (playwright-core из scratchpad, в проект не добавлялся): смена роли и перезагрузка,
  ошибка «Show at least one column», сохранение и перезагрузка, после переключения на viewer `POST /api/campaigns`
  → 403; ошибок в консоли нет. Невалидная роль в cookie → `editor`.

### Фаза 4 — список кампаний
- `app/campaigns/page.tsx` (Server) отдаёт роль, владельцев и preferences; строки грузит клиент.
  `/` теперь редиректит на `/campaigns`. `app/providers.tsx` — `QueryClientProvider`.
- `features/campaigns/list/`:
  - `list-params.ts` (+ тесты) — мягкий разбор URL страницы и сериализация; `toApiSearchParams` для API.
  - `campaigns-query.ts` — ключ запроса, загрузка страницы, `patchCampaignRows` (правка строк в кеше).
  - `campaigns-view.tsx` — корень: URL-состояние, `useInfiniteQuery`, выбор строк, inline-статус, bulk.
  - `campaigns-table.tsx` — TanStack Table v9 + TanStack Virtual: строки фиксированной высоты, догрузка,
    сортировка заголовками, ресайз колонок, восстановление скролла.
  - `columns.tsx` — колонки и фичи таблицы на уровне модуля; `filters-bar.tsx`, `bulk-bar.tsx`.
- `features/campaigns/actions.ts` — `changeStatusAction`, `bulkStatusAction`; `lib/fetch-json.ts` (`ApiError`),
  `lib/datetime.ts`, `server/users.ts`.
- Решения:
  - **URL пишется через `history.replaceState`, патч накладывается на текущий `window.location`** — отложенный
    поиск (debounce 300 мс) не может откатить более новое изменение фильтра. `replaceState`, а не `pushState`:
    фильтры не засоряют историю «назад».
  - **Debounce поиска — таймер в обработчике** (`setTimeout` + `clearTimeout`), без отдельного хука и эффекта.
  - **Сортировка не входит в таблицу**: она серверная и живёт в URL; заголовок — кнопка, меняющая URL.
    `rowSortingFeature` не подключён — не нужно синхронизировать лишнее состояние.
  - **Колонки — на уровне модуля, рантайм-данные (роль, обработчики, ошибки строк) — через `meta`** таблицы
    (`tableMeta: metaHelper<…>()` в v9): TanStack требует стабильных `features`/`columns`/`data`.
  - **Обоснованные `useMemo`:** `pages.flatMap(...)` (стабильный `data`) и производные `columnVisibility` /
    `columnSizing` (новый объект на каждый рендер выглядел бы для таблицы как смена состояния).
    `meta` — обычный объект: стабильность ему не нужна.
  - **Фиксированная высота строки (44 px)**: виртуализатор знает позиции без измерений → нет скачков.
  - **Ресайз `columnResizeMode: "onEnd"`**: ширина фиксируется один раз в конце перетаскивания — один `replaceState`,
    строки не перерисовываются на каждое движение мыши.
  - **Inline-статус**: `useMutation` → `onMutate` отменяет текущие загрузки списка и ставит предполагаемый статус;
    `onError` откатывает **только эту строку** (не снимок всего кеша — чужие правки не теряются); `onSuccess`
    ставит статус и версию из ответа сервера.
  - **Bulk**: один Server Action со списком id; сервер возвращает `ok: [{ id, status }]` и `failed: [{ id, reason }]`.
    Загруженные строки патчатся, ошибки показываются в своих строках, выделенными остаются только неудачные.
    Кеш помечается устаревшим без немедленного перезапроса (`refetchType: "none"`), чтобы не перегружать все
    загруженные страницы. Прогресс — индикатор «Pausing N campaigns…» (запрос один, процентов нет).
  - **Возврат к списку**: страницы лежат в кеше React Query (`staleTime` 60 с), позиция скролла — в
    `sessionStorage` по ключу «фильтры + сортировка», применяется через `initialOffset` виртуализатора.
    Таблица получает `key` = этот ключ: новый фильтр → новый список с начала.
  - Viewer не видит чекбоксы и кнопки действий; сервер всё равно отвечает 403.
- Находки:
  - **База переехала из `.data/` в `$TMPDIR/campaign-builder/`.** `next dev` (Turbopack) следит за папкой проекта;
    SQLite трогает `-wal`/`-shm` даже при чтении → пересборка → Fast Refresh перезагружал страницу → новый запрос →
    бесконечный цикл. Проверено: с базой вне проекта — 0 пересборок. Опции «игнорировать путь» у Turbopack нет.
  - У кнопок сортировки есть `aria-label="Sort by …"`: иначе «Status» (фильтр) и «Status» (заголовок) неразличимы
    для скринридера (нашлось при прогоне в браузере).
  - ESLint (`react-hooks/incompatible-library`) предупреждает, что React Compiler пропустит компонент с
    `useVirtualizer`. Компилятор не включён, на работу не влияет.
- Проверено в headless Chrome: редирект, 50 000 в счётчике, догрузка страниц, фильтры/сортировка/колонки/ширины
  в URL и после reload, inline-пауза (статус меняется сразу), bulk с частичными ошибками, возврат со скроллом
  2200 → 2200, edge cases `?status[]=hack`, `?cursor=garbage`, `?search=%25`, мусор в `sort`/`w`; viewer без
  чекбоксов и действий; ошибок в консоли нет.
