# VR Control Center

OnePlace desktop control center for VR headsets, streams and arena games.

## Windows release

Install `VR Control Center-0.2.0-win-x64-setup.exe`, or extract the complete
`VR Control Center-0.2.0-win-x64.zip` and launch `VR Control Center.exe`.
The Windows release includes ADB 37.0.1, scrcpy 5.0.1, matching scrcpy-server,
USB/SDL/FFmpeg/libusb DLLs, third-party notices and operator instructions.
Node.js, npm, SideQuest and separately installed ADB/scrcpy are not required.

The default **Automatic** tool source uses the bundled Windows x64 distribution;
on other platforms it uses system PATH. Existing custom/PATH selections are
preserved. If upgrading an old configuration without system tools, select
**Automatic** in Settings for both ADB and scrcpy.

## Development requirements

- Node.js 24 LTS is recommended.
- npm.
- macOS, including Apple Silicon, or Windows x64.

## Installation

```sh
npm install
```

Installation downloads the Electron runtime as part of `postinstall`. If dependencies
were installed with scripts disabled, run `npm run electron:install` before development.

## Development

```sh
npm run dev
```

The application is local-only at this stage. It does not start a backend server and does not expose a network API.

macOS development uses `adb` and `scrcpy` from PATH or custom executable paths.
On Windows, `npm run tools:prepare:win` prepares bundled tools for development.

User configuration is stored as human-readable JSON in Electron's standard `userData` directory. The app creates `config.json` on first launch and restores defaults if the file is missing or corrupted. Configuration is loaded once per application session; restart the app after editing the file manually. Updates are serialized and saved through an atomic file replacement.

When a legacy configuration exists and the new `vr-control-center/config.json` does not, the app copies the legacy configuration to the new location on startup.

## Type checking

```sh
npm run typecheck
```

This checks the Electron main process, preload script, shared contracts, Vue renderer, and tests.

## Tests

```sh
npm run test
```

Unit tests cover configuration persistence and concurrent updates, ADB and runtime parsers, polling and reconnect scheduling, scrcpy process lifecycle, window close behavior, and renderer presentation models. Tests mock Electron and device processes; they do not require a connected headset.

Tests live in `tests/main`, `tests/renderer`, and `tests/shared`, mirroring the
application modules. Shared Electron/logging mocks are in `tests/setup.ts`.
Vitest collects only `tests/**/*.test.ts`; test imports use `@main`, `@renderer`,
and `@shared` aliases. Tests have their own TypeScript configuration at
`tests/tsconfig.json` and are not included in the application bundles.

## Production build

```sh
npm run build
```

Packaging targets are configured for macOS and Windows:

```sh
npm run build:mac
npm run build:win
```

macOS uses a `dmg` target. Run Windows packaging on Windows x64 or in the
**Windows release** GitHub Actions workflow. `build:win` verifies the pinned
upstream archive SHA-256, packages NSIS and ZIP outputs, checks every bundled
file hash and runs the packaged app's tool verification without system tools
on PATH. Release checksums and JSON verification reports are written to `dist/`.

Generated binaries under `resources/tools/win32-x64` are ignored by Git. The
version, download URL, SHA-256 and required files are pinned in
`scripts/windows-tools.lock.json`; the full upstream distribution is retained.
An already-downloaded official ZIP can be supplied with
`node scripts/prepare-windows-tools.mjs --archive PATH_TO_ZIP`.

Pull requests to `main` build and upload a complete `windows-x64` artifact. For
same-repository `release/*` branches, CI also attaches these files to a draft
GitHub release. Tags matching the package version (`v0.2.0`) prepare a draft too.
Published releases are kept unchanged. The workflow does not publish a release
automatically. Builds are unsigned.

## Project structure

```text
src/
├── main/
│   ├── bootstrap/       # Application startup, window, lifecycle and IPC registration
│   ├── modules/         # Application, configuration, devices and streaming
│   ├── infrastructure/  # ADB, scrcpy, child processes, binary resolution and logging
│   └── migrations/      # Legacy application data migration
├── preload/             # Typed API exposed through contextBridge
├── renderer/src/
│   ├── components/      # Device cards, dialogs, profiles, settings and event log
│   ├── composables/     # Configuration, device control and UI state
│   ├── i18n/
│   └── locales/         # English and Russian translations
└── shared/
    ├── config/          # Defaults, validation and normalization
    ├── contracts/       # Configuration and IPC types
    └── tools/           # Runtime parsers and scrcpy arguments
```

## Current scope

- Electron, Vue 3, TypeScript, Vite, preload, and typed IPC are wired together.
- The renderer has no direct Node.js access.
- The window title, package name, product name, appId, userData path, and logs path use `VR Control Center` / `vr-control-center` naming.
- The main process writes technical logs to Electron's standard logs directory and exposes the path in Diagnostics.
- The main process owns the Configuration Service. Renderer receives configuration through typed preload IPC only.
- Configuration stores user data only: devices, team game shortcuts, stream profiles, application settings, and logger settings.
- ADB connection state, scrcpy process state, process IDs, discovered devices, and errors remain runtime state and are not persisted.
- Devices can be managed independently, including simultaneous scrcpy streams with per-device profiles.
- Runtime polling retrieves connection state, battery information, and the foreground application. Connection checks use the configured polling interval independently of telemetry; automatic reconnect uses separate retry timestamps. At most two telemetry queries run concurrently.
- Removing a device, changing its address, or resetting configuration stops its associated stream. Late events from removed devices are ignored.
- Window close behavior supports quitting immediately, asking for confirmation, or hiding to the system tray. Quitting stops scrcpy processes; hiding keeps them running.
- Windows x64 packages include the full pinned ADB/scrcpy distribution; macOS uses system/custom tools.
- A connected headset's Applications library lists launchable Android applications, searches names and package identifiers, and launches the selected package through ADB. Background services without launcher activities are excluded.
- Startup integration, mock devices, remote control, and a separate agent are not implemented yet.

## OnePlace appearance and system tray

The interface uses OnePlace's logo, dark navy/fuchsia palette, and Matahari heading
font. Logos, font, application icons, and tray icons are bundled locally and work
without internet. Branding sources and icon variants are documented in
[`resources/branding/README.md`](resources/branding/README.md).

The OnePlace tray menu offers **Open application** and **Quit**. To keep streams
running when closing the window, choose **Minimize to tray** under
**Settings → General → Window close behavior**. Open the window again through
the tray menu. On macOS the menu bar uses the monochrome headset symbol so it
adapts to the system appearance; the Dock uses the full color application icon.
Packaged macOS and Windows builds also use the OnePlace application icon.

Hiding or minimizing all application windows keeps connection checks and streams
active while reducing telemetry: battery updates at most every 120 seconds and
the foreground app every 60 seconds. Visible windows update battery at most every
30 seconds and the foreground app at the configured polling interval. Longer
polling intervals may reduce these rates further. Restoring the window and manual
refresh request fresh telemetry immediately. A slow telemetry query does not block
transport discovery, connection commands, or starting another headset's stream.

## Correct a headset clock

On a connected headset's card, open **⋯ → Set current time**. The app copies the
computer's current clock, so the PC must have the correct date and time. This
works over the local ADB connection without SideQuest, epoch websites or internet
access on the headset. No background time-sync timer is added.

The main process samples `Date.now()` immediately before sending
`adb -s IP:PORT shell service call alarm 2 i64 UNIX_MILLISECONDS`. The timestamp
is already milliseconds since the Unix epoch; an ISO string is only a display
format and is not sent to this command. There is exactly one `i64` argument.
The operation uses the selected headset's control queue and checks its generation
between commands, so disconnects and address changes invalidate pending work.

Success requires a successful boolean Binder response and a subsequent
`adb -s IP:PORT shell date +%s` reading within 10 seconds of the PC clock (allowing
for seconds precision and transport delay). The result appears on the card and
in the event log. Verification failure does not prove the clock was unchanged;
it means the app could not confirm synchronization. Time zone and automatic-time
settings are left unchanged. Firmware can deny this private Android operation;
permission errors are displayed instead of requesting root or reporting success.
The underlying API is [AlarmManager.setTime(long millis)](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/apex/jobscheduler/framework/java/android/app/IAlarmManager.aidl).

## Team games on the PC

Open **Team games → Add game**, enter a name and optional operator note, then
choose the shortcut normally used to start the franchise game or its server.
Cards offer **Start** and **Edit**. The editor can change the name, note and
shortcut, or remove the entry from the list without deleting any files.

Windows supports `.lnk`, `.url`, `.exe`, `.bat` and `.cmd`; macOS supports `.app`,
`.webloc` and `.command`. These games launch on the local computer and do not
require an ADB connection. The OS opens the saved file, preserving arguments and
working directory inside a shortcut. Launch confirmation means the OS accepted
the request; server readiness and externally started processes are not monitored.
The game/server keeps running when VR Control Center exits. No background polling
is added for these games. Shortcuts are stored in the application configuration;
existing configurations gain an empty list without losing headset settings.

## Headset applications and artwork

Connect a headset and open **Applications** in its card. The list combines Android's
MAIN launcher, leanback launcher and information activities for the current user.
Each package appears once. Launching re-queries the device before calling `am start -W`
and reports Android launch errors even when ADB returns exit code zero. Applications
that require a vendor-specific launcher or are not exported can refuse a standard
ADB activity launch; this is shown as an error, not as a successful launch.

Opening or refreshing the library immediately shows the ADB list with cached artwork,
then automatically queries [MetaMetadata](https://github.com/threethan/MetaMetadata)
by package name and retrieves images from [QuestLauncherImages](https://github.com/threethan/QuestLauncherImages)
or Meta's image CDN. These are the same public sources used by LightningLauncher;
no LightningLauncher code or bundled images are copied into this project. Source
coverage varies: unknown packages keep their identifier and a placeholder card.

Names and raster images are cached under `application-artwork` in Electron's userData
directory. Subsequent library openings work without internet. Network requests have
timeouts, size limits and image-host validation; failed artwork never blocks launching.
Images are passed to the renderer as cached data URLs rather than remote URLs.
The in-memory artwork cache uses LRU eviction with a 256-entry limit and a 16 MiB
estimated data budget. Eviction keeps the disk cache intact; this budget does not
limit total Electron memory or images currently displayed by the renderer.
The feature does not require LightningLauncher to be installed on the headset.

Tests cover package/component parsing, launch targeting and errors, metadata caching,
request deduplication, offline behavior, unsafe redirects and oversized image rejection.

### Verify public artwork sources

To explicitly test the public metadata sources (requires internet), run on macOS/Linux:

```sh
VRCC_LIVE_ARTWORK=1 npm test -- tests/main/infrastructure/metadata/application-metadata.live.test.ts
```

This integration test downloads actual covers into a temporary directory and verifies
that the disk cache can be read with the network disabled. Normal unit tests skip it.
