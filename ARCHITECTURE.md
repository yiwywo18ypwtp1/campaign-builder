# Campaign Builder — архитектура

Живой документ: обновляется после каждой фазы. Объём работы — уровень **Core** тестового задания.
Advanced и Bonus не реализуются,
пока об этом явно не попросят.

## 1. Принципы и ограничения

1. **Простота важнее «enterprise»-слоёв.** Никаких repository/service/ORM-абстракций, фабрик, DI,
   generic-утилит и своих мини-фреймворков без конкретной проблемы из задания.
2. **In-memory store — просто объект на `globalThis`** и обычные функции, которые его читают и меняют.
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
| Таймзоны | `date-fns` + `@date-fns/tz` | Перевод wall-time → момент с DST вручную не пишем |
| График | Inline SVG | 60 точек; библиотека не нужна |
| Тесты | Vitest 5 (среда node) | Unit-тесты схем, URL-параметров, денег, курсора (Core) |

## 3. Допущения

1. **Хранилище:** in-memory на `globalThis` (переживает hot reload), 50k кампаний генерируются из
   фиксированного seed при первом обращении. Рестарт сервера сбрасывает данные.
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

Как измеряли — будет дописано в фазах 4, 5 и 7.

## 9. От чего отказались

- Redux / Zustand / Context-сторы — URL + RHF + React Query покрывают всё.
- Repository/service-классы, DI, ORM, SQLite — один in-memory store, обычные функции.
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
| 2 | Mock-сервер и route handlers | Эндпоинты отвечают (включая 400/403/409/412); тесты курсора | ⏳ |
| 3 | Настройки (роль, таймзона, колонки) | Смена роли меняет серверные 403 | ⏳ |
| 4 | Список | Edge cases списка, замер скролла | ⏳ |
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
