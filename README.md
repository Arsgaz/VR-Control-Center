# VR Control Center

Local desktop application shell for managing a VR headset from the user's computer.

## Requirements

- Node.js 24 LTS is recommended.
- npm.
- macOS, including Apple Silicon, or Windows x64.

## Installation

```sh
npm install
```

## Development

```sh
npm run dev
```

The application is local-only at this stage. It does not start a backend server and does not expose a network API.

The first workflow uses system-installed `adb` and `scrcpy` from `PATH`.

User configuration is stored as human-readable JSON in Electron's standard `userData` directory. The app creates `config.json` on first launch and restores defaults if the file is missing or corrupted.

When a legacy configuration exists and the new `vr-control-center/config.json` does not, the app copies the legacy configuration to the new location on startup.

## Type checking

```sh
npm run typecheck
```

This checks the Electron main process, preload script, shared contracts, and Vue renderer.

## Tests

```sh
npm run test
```

Current tests cover ADB device-list parsing, scrcpy argument construction, and user event-log model behavior.

## Production build

```sh
npm run build
```

Packaging targets are configured for macOS and Windows:

```sh
npm run build:mac
npm run build:win
```

macOS uses a `dmg` target. Windows uses an `nsis` target. Windows packaging should be run on Windows or in CI when cross-building from macOS is not available.

## Project structure

```text
src/
├── main/
│   ├── index.ts
│   ├── window/
│   │   └── create-main-window.ts
│   ├── ipc/
│   │   ├── app.handlers.ts
│   │   └── headset.handlers.ts
│   ├── logger/
│   │   └── logger.ts
│   ├── config/
│   │   └── configuration.service.ts
│   └── tools/
│       ├── adb.service.ts
│       ├── process-runner.ts
│       └── scrcpy.service.ts
├── preload/
│   ├── index.ts
│   └── index.d.ts
├── renderer/
│   ├── index.html
│   └── src/
│       ├── assets/
│       ├── composables/
│       │   ├── event-log.model.ts
│       │   ├── useEventLog.ts
│       │   └── useHeadsetController.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppNavigation.vue
│       │   │   └── UserEventLog.vue
│       │   └── sections/
│       │       ├── DevicesSection.vue
│       │       ├── DiagnosticsSection.vue
│       │       └── StreamProfilesSection.vue
│       ├── App.vue
│       ├── main.ts
│       └── styles.css
└── shared/
    ├── config/
    │   ├── config.validation.ts
    │   └── default-config.ts
    ├── contracts/
    │   ├── app.contracts.ts
    │   ├── config.contracts.ts
    │   └── headset.contracts.ts
    └── tools/
        ├── adb.parser.ts
        └── scrcpy.args.ts
```

## Current scope

- Electron, Vue 3, TypeScript, Vite, preload, and typed IPC are wired together.
- The renderer has no direct Node.js access.
- The window title, package name, product name, appId, userData path, and logs path use `VR Control Center` / `vr-control-center` naming.
- The main process writes technical logs to Electron's standard logs directory and exposes the path in Diagnostics.
- The main process owns the Configuration Service. Renderer receives configuration through typed preload IPC only.
- Configuration stores user data only: application settings, devices, stream profiles, settings, and logger settings.
- ADB connection state, scrcpy process state, process IDs, discovered devices, and errors remain runtime state and are not persisted.
- The first local workflow checks system `adb` and `scrcpy`, lists ADB devices, connects or disconnects one headset address, and starts or stops one scrcpy stream.
- ADB and scrcpy binaries are not bundled yet.
- Multi-device management, mock devices, remote control, and a separate agent are not implemented yet.
