# OnePlace branding

Source logo: https://static.tildacdn.com/tild3466-3730-4764-b363-663232666332/Group_48096190.svg
Brand reference: https://oneplace-vr.ru/

The supplied SVG is preserved as `oneplace-logo.svg`. `oneplace-mark.svg` uses the
same paths with a cropped viewBox around the headset symbol, so the sign remains
readable in small UI elements and the system tray.

- `icon.png`, `icon.ico`, `icon.icns`: application, window and installer icons.
- `tray.png`: color system tray icon for Windows/Linux.
- `trayTemplate.png`, `trayTemplate@2x.png`: monochrome macOS menu bar images;
  Electron marks them as templates so macOS adapts them to light/dark appearance.
- `icon-*.png`: source raster sizes included in the ICO/ICNS files.

Renderer assets are bundled locally. Golos Text Variable is the UI typeface;
Matahari Extended 700 from the website's CSS is retained for the brand lockup.
Golos source: https://github.com/google/fonts/tree/main/ofl/golostext
Its SIL OFL license is included under resources/third-party/GOLOS-TEXT-OFL.txt
and copied into font-licenses in every packaged platform.
The static arena-contours.svg background and the shared AppIcon SVG paths are
local code assets; they do not animate continuously. Branding does not require a network connection at runtime.
