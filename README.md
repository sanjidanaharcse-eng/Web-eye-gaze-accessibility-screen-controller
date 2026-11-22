# Web Eye-Gaze Accessibility Screen Controller (Chrome extension)

## Install (developer mode)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open Facebook / Gmail / YouTube, click the extension icon and switch **Gaze control on**.

## Modes
- **Pointer (test)**: your mouse acts as the gaze. Works immediately, good for testing dwell click, edge scroll and the dock.
- **Webcam**: real eye tracking. Needs the WebGazer library:
  1. Download `webgazer.js` (or `webgazer.min.js`) from https://github.com/brownhci/WebGazer (see the build/dist folder or releases).
  2. Replace `lib/webgazer.js` in this folder with that file.
  3. Reload the extension, choose **Webcam** in the popup, allow the camera for the site, then look at the 9 calibration dots.

## Controls
- Hold your gaze on a button/link until the ring fills: click.
- Look at the top or bottom 14% of the screen: scroll.
- Dock (right side): Pause, Back, Forward, Prev tab, Next tab, Calibrate, Turn off.
- Hotkey Alt+Shift+G: pause / resume.

Video is processed locally by WebGazer. Nothing is uploaded and no external AI API is used.
