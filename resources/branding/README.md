# OnePlace branding

Source logo: https://static.tildacdn.com/tild3466-3730-4764-b363-663232666332/Group_48096190.svg
Brand reference: https://oneplace-vr.ru/

The supplied SVG is preserved as `oneplace-logo.svg`. `oneplace-mark.svg` uses the
same paths with a cropped viewBox around the headset symbol, so the sign remains
readable in small UI elements and the system tray.

- `headset.svg`: only the three headset paths extracted from the supplied logo;
  the same geometry is used by the renderer's headset icon.
- `headset-app.svg`, `icon.png`, `icon-*.png`, `icon.ico`, `icon.icns`: one simplified
  headset on a dark rounded tile for app windows, macOS Dock/Finder, Windows
  taskbar, executables, shortcuts and installer. ICO includes
  16/20/24/32/40/48/64/128/256 px representations.
- `tray.png`, `tray@2x.png`: monochrome light headset for a dark Windows/Linux tray.
  `tray-light.png`, `tray-light@2x.png`: dark headset for a light Windows taskbar.
  Windows follows the system taskbar theme and updates the image when it changes.
- `trayTemplate.png`, `trayTemplate@2x.png`: monochrome macOS menu bar images;
  Electron marks them as templates so macOS adapts them to light/dark appearance.

To regenerate all PNG/ICO/ICNS assets from the checked-in SVGs on macOS, run
`swift scripts/generate-branding.swift` from the repository root. The script
uses AppKit and needs no downloaded dependencies. PNG sizes include 1024 px; ICNS
contains standard and Retina representations.

`npm run dev` uses a cached branded copy of Electron on macOS so Dock shows
VR Control Center instead of Electron. Only the copy under `node_modules/.cache`
is changed and ad-hoc signed; the installed Electron runtime is untouched.
Packaged builds use electron-builder productName/appId and the same icon files.
The runtime pins existing userData/log paths before applying its display name.

Renderer assets are bundled locally. Golos Text Variable is the UI typeface;
Matahari Extended 700 from the website's CSS is retained for the brand lockup.
Golos source: https://github.com/google/fonts/tree/main/ofl/golostext
Its SIL OFL license is included under resources/third-party/GOLOS-TEXT-OFL.txt
and copied into font-licenses in every packaged platform.
The static arena-contours.svg background and the shared AppIcon SVG paths are
local code assets; they do not animate continuously. Branding does not require a network connection at runtime.
