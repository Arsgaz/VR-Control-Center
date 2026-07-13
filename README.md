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

## Type checking

```sh
npm run typecheck
```

This checks the Electron main process, preload script, shared contracts, and Vue renderer.

## Tests

```sh
npm run test
```

Current tests cover ADB device-list parsing and scrcpy argument construction.

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
│       ├── components/
│       │   └── HeadsetControl.vue
│       ├── App.vue
│       ├── main.ts
│       └── styles.css
└── shared/
    ├── contracts/
    │   ├── app.contracts.ts
    │   └── headset.contracts.ts
    └── tools/
        ├── adb.parser.ts
        └── scrcpy.args.ts
```

## Current scope

- Electron, Vue 3, TypeScript, Vite, preload, and typed IPC are wired together.
- The renderer has no direct Node.js access.
- The first local workflow checks system `adb` and `scrcpy`, lists ADB devices, connects or disconnects one headset address, and starts or stops one scrcpy stream.
- ADB and scrcpy binaries are not bundled yet.
- Multi-device management, mock devices, remote control, and Arena Agent are not implemented yet.
