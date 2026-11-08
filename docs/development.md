# Разработка

## Окружение и запуск

Используйте Node.js 24 и npm. Все команды выполняются **из каталога
VR-Control-Center**, где находится `package.json`.

```sh
cd /path/to/VR-Control-Center
npm ci
npm run dev
```

`npm ci` использует зафиксированный `package-lock.json`. Postinstall загружает
Electron и подготавливает его зависимости. Если install scripts были запрещены,
сначала проверьте политику npm и выполните `npm run electron:install`.
Отсутствие `npm` означает, что сначала нужно установить Node.js; `ENOENT package.json`
обычно означает неверный текущий каталог.

Dev запускает main/preload через electron-vite и renderer через Vite. URL
`localhost:5173` — dev-сервер интерфейса; полноценная работа требует Electron и
его preload API. В обычном браузере API `window.vrControl` отсутствует.

`scripts/dev.mjs` на macOS подготавливает отдельную копию Electron в
`node_modules/.cache/vr-control-center`: с именем VR Control Center и общим значком
шлема. Копия получает ad-hoc подпись с сохранением Electron JIT entitlements;
поставленный npm-пакетом Electron не меняется. Копия кэшируется по версии runtime,
имени и иконке. На Windows/Linux используется обычный runtime electron-vite.
Чтобы применить изменение имени/иконки к уже открытому dev-приложению, остановите
его и повторите `npm run dev`; одной перезагрузки страницы недостаточно.

Общие иконки PNG/ICO/ICNS и варианты трея генерируются на macOS командой
`npm run branding:generate` из SVG в `resources/branding`. Сгенерированные файлы
хранятся в Git и используются сборками без Swift/AppKit на Windows.

На macOS ADB/scrcpy должны быть в PATH процесса приложения либо выбраны как custom.
Для Windows x64 подготовка встроенного комплекта доступна через:

```sh
npm run tools:prepare:win
```

Проверяйте путь инструментов в настройках, особенно при старой конфигурации.
UI-тест без физического шлема не подтверждает реальное подключение/трансляцию.

## Навигация по проекту

```text
src/
  main/
    index.ts                 # Вход Electron, отдельный режим проверки пакета
    bootstrap/               # Композиция, окно, lifecycle, трей и IPC
    modules/                 # Configuration, devices, streaming, applications, team-games
    infrastructure/          # ADB, scrcpy, metadata, процессы, binaries, branding, logging
    migrations/              # Перенос legacy-данных
  preload/index.ts           # contextBridge → window.vrControl
  renderer/src/
    components/              # Разделы, карточки и диалоги
    composables/             # Конфигурация, управление шлемами, журнал
    locales/ru/, locales/en/ # Локализация
    styles.css               # Общая тема
  shared/
    contracts/               # IPC-типы и каналы
    config/                  # Defaults, runtime-валидация, нормализация
    tools/                   # Парсеры и построение аргументов
scripts/                     # Подготовка и проверка Windows-комплекта
resources/                   # Брендинг, лицензии, инструкция, генерируемые инструменты
tests/                       # Зеркало модулей; release-проверки
```

Точки входа для изменения сценариев и их взаимодействие описаны в [SDD](SDD.md).
Псевдонимы `@main`, `@renderer`, `@shared` настроены в сборке и Vitest; тесты
не хранятся рядом с production-модулями и не входят в production bundle.

## Внесение изменений

1. Опишите операцию и результат в `shared/contracts`. Обрабатывайте ошибки как
   отдельный исход, не только как успешный exit code внешнего процесса.
2. Добавьте main service/handler и регистрацию в bootstrap, если они нужны.
   Проверяйте вход в main: типы TypeScript после IPC не являются защитой.
3. Опубликуйте конкретный метод через preload. Не добавляйте API произвольного
   выполнения shell-команд или передачи выбранного renderer Android-компонента.
4. Для управления существующим шлемом используйте `HeadsetRuntimeManager` и его
   очередь/поколение. Если операция имеет отдельную координацию, явно документируйте
   пересечения с disconnect, сменой адреса и удалением.
5. UI-компонентам оставляйте представление, доступность, сообщения и состояние
   ожидания. Строки добавляйте одновременно в RU и EN.
6. Изменения схемы проводите через defaults и нормализацию: старый `config.json`
   должен либо корректно мигрировать, либо явно пройти штатное восстановление.
7. Добавьте проверки значимых ошибок/гонок и обновите документацию сценария.

Изменение ADB source не должно создавать расхождение с ADB, который запускает
scrcpy. Для встроенного scrcpy сохраняйте пару binary + server из одного комплекта.
При работе с процессами используйте массив аргументов, `shell: false` и таймауты.

## Локальная проверка

```sh
npm run lint
npm test
npm run build
```

`build` включает TypeScript main, Vue renderer, тестов и production bundles.
Для отдельных type checks есть `npm run typecheck`.
Тесты по умолчанию используют Node, mock Electron/ADB и виртуальное время;
описание реальных проверок и Windows CI — в [testing-and-release.md](testing-and-release.md).

Production и dev по умолчанию используют один стандартный каталог пользовательских
данных для этого app name. Сохраните копию конфигурации перед экспериментами с
реальными карточками. Файлы кэша/конфига/логов и бинарники не добавляются в Git.

## Документация

`docs/SDD.md` описывает принятую архитектуру и реализованные гарантии.
`known-limitations.md` содержит текущие пробелы без исторических утверждений о
якобы существующих исправленных ошибках. Временные исследования держите в
игнорируемом `docs/local/`, подтверждённые решения переносите в постоянные документы.
Release notes `docs/releases/windows.md` — текст для пользователя релиза, а не SDD.
