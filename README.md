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

Env-переменные, проверка edge cases и прочее будут описаны по мере реализации фаз.
