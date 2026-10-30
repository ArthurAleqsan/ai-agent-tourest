# Tourest AI Lead Hunter — руководство оператора

Локальный инструмент поиска и квалификации B2C-запросов на экскурсии Tourest
([tourest.online](https://tourest.online)). Приложение **не публикует** сообщения
в Telegram, Facebook, email и любые другие каналы. Черновик можно только
скопировать после ручного одобрения.

Проверка ниже опирается на код репозитория и на живой прогон локального API
**30 октября 2026**. То, что не вызывалось вживую, помечено как «по коду, не
проверено вживую».

---

## 1. Запуск

Нужен **Node.js 18.20.8** (см. `.nvmrc`). `better-sqlite3` v11 не собирается на
других минорных версиях так же надёжно.

```bash
cd /path/to/tourestB2Cagent

nvm install 18.20.8
nvm use

npm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

npm run db:migrate
npm run dev
```

После старта:

| Сервис | URL |
| ------ | --- |
| Дашборд | http://localhost:5173 |
| API | http://localhost:4000 |
| Health | http://localhost:4000/api/health |

Индикатор Health в шапке дашборда опрашивает `/api/health`.

База — локальный SQLite: `apps/api/data/tourest.db` (путь задаётся
`DATABASE_PATH`). Это **не** продакшен Tourest.

Остановка: `Ctrl+C` в терминале `npm run dev`.

---

## 2. Обязательная конфигурация

Файл: `apps/api/.env`. Секреты не коммитьте.

| Переменная | Обязательна? | Назначение |
| ---------- | ------------ | ---------- |
| `PORT` | нет (по умолчанию 4000) | Порт API |
| `WEB_ORIGIN` | нет | CORS для дашборда (`http://localhost:5173`) |
| `DATABASE_PATH` | нет | Путь к SQLite |
| `OLLAMA_BASE_URL` | да, если нужна квалификация | Обычно `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | да, если нужна квалификация | Тег модели в Ollama |
| `OLLAMA_TIMEOUT_MS` | нет (60000) | Таймаут AI-запроса |
| `OLLAMA_MAX_RETRIES` | нет (2) | Повторы при сбое AI |
| `OLLAMA_TEMPERATURE` | нет (0) | Температура выборки |
| `TELEGRAM_BOT_TOKEN` | да, если нужен Telegram | Токен BotFather. Пусто = Telegram выключен |
| `TELEGRAM_WEBHOOK_SECRET` | нет | Проверка `POST /api/telegram/webhook` |
| `INGESTION_TELEGRAM_CRON` | нет | Расписание опроса (`*/2 * * * *`) |
| `TOUR_CATALOG_API_URL` | нет | Авторизованный HTTP-каталог. Пусто = только CSV/JSON |
| `TOUR_CATALOG_API_TOKEN` | нет | Значение заголовка каталога |
| `TOUR_CATALOG_API_HEADER` | нет | Имя заголовка (`Authorization`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | да в сети | Пустой пароль = **авторизация выключена** |
| `JOBS_DISABLED` | нет | Имена джобов, которые не стартуют |
| `LOG_LEVEL` | нет | `debug` / `info` / `warn` / `error` |

Веб (`apps/web/.env`):

| Переменная | Назначение |
| ---------- | ---------- |
| `VITE_API_BASE_URL` | Пусто = прокси Vite `/api` |
| `VITE_API_PROXY_TARGET` | `http://localhost:4000` |

### Что нужно, чтобы реально искать лиды

1. Установить и запустить [Ollama](https://ollama.com), скачать модель:
   `ollama pull llama3.1:8b` (или `qwen3:4b` — см. фактическое значение
   `OLLAMA_MODEL` в Settings).
2. Импортировать каталог туров Tourest (CSV/JSON) в **Settings**, либо задать
   авторизованный `TOUR_CATALOG_API_URL`.
3. Добавлять запросы вручную **или** настроить Telegram-бота (токен + источник
   типа `telegram` + allowlist чатов).
4. Facebook и Yandex Wordstat — только ручной импорт CSV/текста, без скрапинга.

---

## 3. Навигация дашборда

SPA без маршрутизатора: пункты меню переключают вид. Подписи на английском.

| Пункт | Что показывает | Что можно сделать |
| ----- | -------------- | ----------------- |
| **Overview** | Счётчики из `/api/analytics` и статус джобов | Только просмотр. Bookings = лиды со статусом `converted` |
| **Sources** | Источники `/api/sources` | Создать, включить/выключить. Import — только для Facebook и Yandex |
| **Discovered Requests** | `/api/source-items` | Вставить текст, Qualify, Promote to lead, Delete |
| **Qualified Leads** | `/api/leads` | Поиск/фильтры, статус пайплайна, заметки, override балла, Generate draft, Delete |
| **AI Recommendations** | `/api/recommendations` | Просмотр матчей. Кнопка Draft reply. **Кнопки «подобрать туры» в UI нет** |
| **Message Drafts** | `/api/drafts` | Edit, Approve, Reject, Copy (только после Approve). **Не отправляет** |
| **SEO Opportunities** | `/api/seo-opportunities` | Только просмотр. Импорт — через Sources |
| **Activity History** | `/api/activity` | Только просмотр аудита |
| **Settings** | `/api/settings`, джобы, каталог, suppression, purge | Run now / Pause / Resume, импорт CSV каталога, блок контакта, очистка истёкших записей |

Типы источников в форме создания: `web_public`, `rss_feed`, `authorized_inbox`,
`manual_entry`, `referral`, `telegram`, `facebook`, `yandex_wordstat`.
**Рабочие адаптеры есть только у `telegram` и `facebook`.** Yandex обрабатывается
отдельно как SEO, не как лиды. Остальные типы сохраняются в БД, но ingest
вернёт ошибку «адаптер не зарегистрирован».

---

## 4. Пошаговый сценарий с пустой базой

### 4.1. Подготовка

1. Запустите `npm run dev`.
2. Убедитесь, что Ollama слушает `127.0.0.1:11434` (`curl http://127.0.0.1:11434/api/tags`).
3. Откройте **Settings → Tour catalog import** и вставьте CSV (заголовки
   допускают синонимы):

```csv
external_id,title,destination,country,category,description,duration_hours,duration_label,languages,price_from,currency,url,availability
SSH-RM-1,Ras Mohammed National Park,Sharm El Sheikh,Egypt,boat_trip,Ras Mohammed reefs,8,Full day,ru|en,65,USD,https://tourest.online/t/ssh-rm-1,"{""available"":true}"
SSH-QUAD-1,Desert Quad Biking,Sharm El Sheikh,Egypt,quad_biking,Quad biking in the desert,3,,ru|en,40,USD,https://tourest.online/t/ssh-quad-1,"{""available"":true}"
```

4. Нажмите **Import catalog**. Проверка: `GET /api/tours` больше не пустой.

Без каталога черновик всё равно можно сгенерировать **после** квалификации, но
в тексте будет отказ «проверенных туров не нашлось» — цены и URL приложение
**не выдумывает**.

### 4.2. Как добавить discovered request

Откройте **Discovered Requests**. В форме одно поле:

| Поле UI | Что вводить |
| ------- | ----------- |
| **Paste a public request** | Публичный текст запроса целиком. Именно его анализирует AI |

Других полей в UI нет. Не вводятся отдельно: имя, телефон, URL, язык, источник.
Источник всегда автосоздаётся как **Manual entry**.

Через API можно передать больше:

```http
POST /api/source-items
{
  "rawContent": "текст запроса",
  "url": "https://example.com/post",
  "externalId": "optional-id",
  "language": "en",
  "isAuthorizedMessage": false
}
```

Пример текста:

> Looking for a diving trip in Hurghada next week, 2 adults. What is the price?

Нажмите **Save request**.

### 4.3. Telegram и Facebook

**Telegram — автоматический сбор возможен, но только при полной настройке.**

По коду:

1. Создайте бота у `@BotFather`, вставьте `TELEGRAM_BOT_TOKEN` в `.env`,
   перезапустите API.
2. Добавьте бота **только** в группы, которые вам разрешено читать. Privacy mode
   лучше оставить включённым: Telegram сам не пришлёт чужие личные чаты.
3. В **Sources** создайте источник типа `telegram`.
4. Allowlist чатов (`monitoredChatIds`) в UI задать нельзя — только через
   `PATCH /api/sources/:id` с `config`. Если список **пустой**, код **не
   отбрасывает** чаты (комментарий в схеме «empty = none» расходится с кодом:
   пустой allowlist = нет фильтра).
5. По умолчанию включён keyword-prefilter по Египту/экскурсиям: сообщения без
   шарм/хургада/экскурсия/цена и т.п. не сохраняются.
6. Джоб `source-ingestion` опрашивает Bot API каждые 2 минуты
   (`getUpdates`). Кнопки Import у Telegram в UI нет; ручной опрос:
   `POST /api/sources/:id/ingest` или **Settings → Run now** у `source-ingestion`.
7. Есть `POST /api/telegram/webhook` (публичный, без admin-auth; секрет —
   `TELEGRAM_WEBHOOK_SECRET`).

**На момент проверки 30.10.2026:** `TELEGRAM_BOT_TOKEN` пуст,
`telegramConfigured: false`, источников типа telegram в БД нет, джоб
`source-ingestion` возвращает `skipped`. Живой сбор из Telegram **не работает**.

**Facebook — импорта «из Facebook» нет.** Нет Graph API, нет скрапинга групп.
Можно только:

1. Создать источник типа `facebook`.
2. Нажать **Import**, вставить JSON `{"text":"публичный пост…"}` или CSV
   `url,text,language`.
3. Нажать **Ingest**.

Это не проверялось живым импортом в этой сессии; поведение подтверждено кодом.

**Yandex Wordstat** — только CSV спроса (колонки вроде `Фраза` / `Показов`).
Записи попадают в **SEO Opportunities**, это **не лиды**.

Автообнаружение кроме Telegram-поллинга **не реализовано**.

### 4.4. Как запустить AI-квалификацию

На карточке запроса: **Qualify** → `POST /api/source-items/:id/qualify`.

Или фоном: джоб `ai-qualification` каждые 5 минут, либо
**Settings → Run now**, либо `POST /api/qualify/run`.

AI **извлекает факты** (направление, даты, активность, intent). Балл считает
детерминированная формула, не модель:

| Сигнал | Баллы |
| ------ | ----- |
| Явный интерес купить | 45 |
| Неявный интерес | 22 |
| Срочность high / medium / low | 20 / 12 / 5 |
| Спрашивает цену | 15 |
| Просит рекомендацию | 10 |
| Упоминает бронь | 20 |
| Предстоящая поездка | 8 |
| Направление или город | 8 |
| Даты | 8 |
| Число туристов | 4 |
| Категория активности | 5 |

Пороги: **hot ≥ 70**, **warm ≥ 40**, **cold ≥ 15**, иначе / нерелевантно —
`irrelevant` (балл 0).

Без работающего Ollama квалификация возвращает `503 AI_UNAVAILABLE`. Это
**подтверждено вживую**.

### 4.5. Как получить лид

На запросе: **Promote to lead** → `POST /api/leads`.

- Если квалификация есть и уровень не `irrelevant` → статус `qualified`,
  подставляются destination/city.
- Если квалификации нет → статус `discovered`, имя Unnamed (если не передали
  `displayName`), destination пустой.

В UI promote **не спрашивает** имя и контакт. Через API:

```json
{ "sourceItemId": "…", "displayName": "Anna", "contactHandle": "@anna" }
```

Право на контакт по умолчанию `needs_review`. Пометить `contacted` нельзя, пока
лид не в статусе `approved`. Подавление контакта в Settings блокирует
`contacted`.

Пайплайн (кнопки **Mark …** на карточке лида):

```
discovered → qualified → draft_ready → approved → contacted → replied → converted
                 ↘ rejected (из большинства статусов; из converted — нельзя)
```

Нельзя перепрыгнуть, например, из `discovered` сразу в `contacted`.

### 4.6. Как сопоставить туры Tourest

Алгоритм `matchTours` — **не нейросеть**, несмотря на пункт меню «AI
Recommendations»:

1. Берутся факты из квалификации.
2. Фильтр по destination/city (туры другого города отбрасываются).
3. Совпадение activity/category/ключевых слов.
4. Sold-out / inactive исключаются.
5. Не больше 3 туров. Цены/URL только из каталога.

Как запустить:

- Джоб `tour-matching` каждые 5 минут (нужна квалификация).
- `POST /api/source-items/:id/match` (в UI кнопки нет).
- **Generate draft** / **Draft reply** — матчинг выполняется внутри создания
  черновика.

Без квалификации матчинг возвращает 404. Без каталога — 0 совпадений.

### 4.7. Как сгенерировать и одобрить сообщение

1. На лиде **Generate draft** или на рекомендации **Draft reply**
   (`POST /api/source-items/:id/draft`).
2. Текст — **шаблон** RU/EN, не Ollama. Русский только если язык начинается с
   `ru`, иначе английский.
3. Статус `pending`. Открыть **Message Drafts**.
4. При необходимости **Edit** (черновик снова pending).
5. **Approve** (в UI `approvedBy` всегда `"dashboard-operator"`). Это **не
   отправка**.
6. **Copy approved text** — буфер обмена. Дальше вы сами пишете человеку в
   исходном канале.
7. На лиде вручную: `approved` → `contacted` → `replied` / `converted`.

Джоб `draft-generation` каждые 10 минут создаёт pending-черновики для уже
сматченных запросов без черновика. Тоже не отправляет.

### 4.8. Как отслеживать лиды и конверсии

- **Qualified Leads**: фильтры search / status / destination / source, сортировка
  по intent или дате.
- **Overview**: собранные items, qualified/hot, approved drafts, contacted,
  replies, bookings. **Bookings считаются только как `converted`**, без
  атрибуции к каналу и без оценки.
- Conversion rate источника = converted / collected items.
- **Activity History**: promote, qualify, draft, purge, suppression, follow-up
  reminders (напоминание в лог, не письмо клиенту).

---

## 5. Устранение неполадок

| Симптом | Что проверить |
| ------- | ------------- |
| Health красный / дашборд пустой | Запущен ли API на :4000. `curl http://localhost:4000/api/health` |
| Дашборд не открывается | Запущен ли Vite на :5173 (`npm run dev` поднимает оба процесса) |
| Qualify → ошибка / джоб `ai-qualification` = failed | Ollama не запущен или модель не скачана. Settings показывает модель и URL |
| Qualify 503 `AI_UNAVAILABLE: fetch failed` | `curl http://127.0.0.1:11434/api/tags` — должен вернуть JSON со списком моделей |
| Модель в Settings не та, что в `.env.example` | Читается фактический `.env`. Пример: в проверке было `llama3.1:8b`, в example — `qwen3:4b` |
| AI Recommendations пустые | Нет квалификации **или** каталог пуст **или** джоб matching ещё не отработал |
| Import catalog ничего не даёт | Нужны колонки `title`/`name` и `destination`. `POST /api/catalog/sync` без URL вернёт `CATALOG_NOT_CONFIGURED` |
| Telegram не собирает | Токен пуст; нет enabled-источника `telegram`; бот не в группе; privacy mode режет сообщения; prefilter отбросил текст |
| Facebook Import не появляется | Источник должен быть типа `facebook` или `yandex_wordstat`, не `telegram` |
| Generate draft 404 Qualification not found | Сначала успешно Qualify |
| Copy серая | Сначала Approve |
| После рестарта API просит логин снова | Сессии в памяти процесса |
| `npm run db:migrate` падает SIGBUS | Другой процесс держит `tourest.db` — остановите API и повторите |
| Создали source `web_public` / `rss_feed` | Адаптера нет, ingest не сработает |

---

## 6. Текущие ограничения (подтверждено)

Не реализовано и не стоит ждать от этого MVP:

- Автоскрапинг Facebook / Instagram / сайтов / RSS.
- Meta Graph API (`NotImplementedError`).
- Бесплатный API Яндекс.Вордстат.
- Каталог Tourest «из коробки» — туров нет, пока не импортируете или не зададите
  свой URL.
- Отправка сообщений в любой мессенджер.
- Кнопка ручного матчинга в UI (есть только API и джоб).
- Редактирование `monitoredChatIds` и прочего `config` источника в UI.
- Поля имени/контакта на форме Promote.
- Мультипользовательский SSO (один локальный admin).
- Персистентные сессии (после рестарта API все разлогинены).
- Оценка/атрибуция бронирований: только ручной статус `converted`.

Раздел «AI Recommendations» назван так в меню; ранжирование туров и текст
черновика — детерминированные правила. Ollama используется **только** на шаге
квалификации.

---

## 7. Живая проверка 30.10.2026 (не предположение)

Среда: API `http://127.0.0.1:4000` жив, БД `ok`, Node **v18.20.8**. Веб на
`:5173` в момент проверки **не отвечал**. Ollama на `:11434` **не слушал**,
бинарника `ollama` в PATH нет.

| Проверка | Результат |
| -------- | --------- |
| Модель в Settings | `llama3.1:8b` (не default `qwen3:4b` из example) |
| Telegram | не сконфигурирован |
| Каталог HTTP | не сконфигурирован; `POST /api/catalog/sync` → 400 `CATALOG_NOT_CONFIGURED` |
| Туры в БД | 0 |
| Джобы | планировщик запущен; 6 джобов enabled; `source-ingestion` = skipped; `ai-qualification` = failed «1 item(s) failed» |
| Auth | выключена (`ADMIN_PASSWORD` пуст) |

Синтетический запрос (явно помечен, в продакшен Tourest не уходил):

> [SYNTHETIC TEST — not a real traveler] We are visiting Sharm El Sheikh on November 15 for 7 days. We want to visit Ras Mohammed and try quad biking. How much do excursions cost?

| Шаг | HTTP | Итог |
| --- | ---- | ---- |
| Source Item `POST /api/source-items` | 201 | Успех, id `b8fc9aa3-…` |
| Qualification `POST …/qualify` | 503 | Провал: `AI_UNAVAILABLE: fetch failed` |
| Lead `POST /api/leads` | 201 | Успех, статус `discovered`, destination пустой |
| Tour matching `POST …/match` | 404 | Провал: нет Qualification |
| Message draft `POST …/draft` | 404 | Провал: нет Qualification |
| Human approval | — | Не достигнуто (черновика нет) |

Сообщения никуда не отправлялись. Каталог не импортировался. Изменены только
локальные строки SQLite (синтетический source item + lead).
