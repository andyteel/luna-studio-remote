# LUNA Studio Remote

LUNA Studio Remote is a standalone macOS companion app for controlling Universal Audio's LUNA from an iPhone, iPad, or another browser on the same local network.

It was built for recording workflows where the Mac running LUNA is across the room, such as tracking drums, vocals, guitars, or any setup where walking back to the computer slows down the session.

## What It Does

- Runs as a standalone macOS desktop app
- Starts a bundled local web server automatically
- Detects the Mac's local network address
- Shows a scannable QR code for phone or tablet access
- Opens a touch-friendly browser remote on devices connected to the same network
- Sends transport and workflow commands to LUNA through macOS Accessibility and Automation permissions

## Current Release

The current public release is built for Apple Silicon Macs.

Download the latest release from the GitHub Releases page:

- `LUNA Studio Remote-1.0.0-arm64.dmg`
- `LUNA Studio Remote-1.0.0-arm64-mac.zip`

The DMG is recommended for most users.

## Requirements

- Apple Silicon Mac
- macOS with Accessibility, Automation, and Local Network permissions available
- Universal Audio LUNA installed on the Mac
- iPhone, iPad, or another browser-based device on the same Wi-Fi or local network

## Installation

1. Download the DMG from the latest GitHub Release.
2. Open the DMG.
3. Drag `LUNA Studio Remote.app` into the `Applications` folder.
4. Launch `LUNA Studio Remote.app`.
5. If macOS blocks the first launch, right-click the app and choose **Open**.

Because this app is not currently signed or notarized, macOS may show a security warning on first launch.

## First Launch

When the app opens, it starts the local server automatically and displays:

- The local network URL
- A QR code for phone or tablet access
- Server controls for copy, open, restart, stop, and quit

Scan the QR code with your iPhone or iPad, or manually open the displayed local URL in a browser.

Your remote device must be on the same Wi-Fi or wired local network as the Mac running LUNA Studio Remote.

## macOS Permissions

LUNA Studio Remote sends keyboard shortcuts to LUNA, so macOS may prompt for permissions.

Allow access for:

- Accessibility
- Automation
- Local Network

If commands do not reach LUNA, open **System Settings** and check the app's permissions under **Privacy & Security**.

## Using the Remote

1. Open LUNA on your Mac.
2. Launch LUNA Studio Remote.
3. Scan the QR code from your phone or tablet.
4. Keep LUNA active or available to receive commands.
5. Use the remote for transport and tracking workflow controls.

## Important Notes

- This is a keystroke-based remote, not an official Universal Audio product.
- It does not receive direct transport, timeline, or mixer state feedback from LUNA.
- If another app takes focus, some commands may not reach LUNA until LUNA is active again.
- Transport behavior depends on LUNA's current shortcut handling and macOS permission state.
- Some workflows may require an extra stop press, especially when pre-roll, post-roll, or record states are involved.
- If macOS Spotlight still uses `Command+Space`, remap that shortcut so the record command can reach LUNA correctly.

## Troubleshooting

### The phone cannot open the remote

- Make sure the phone and Mac are on the same Wi-Fi or local network.
- Disable VPNs or network isolation features that block local device discovery.
- Restart the server from the LUNA Studio Remote window.
- Quit and relaunch the app.

### The remote opens, but LUNA does not respond

- Confirm that LUNA is open.
- Confirm that LUNA Studio Remote has Accessibility permission.
- Confirm that macOS has allowed Automation permission.
- Click back into LUNA and try the command again.

### Record does not work as expected

- Check for macOS shortcut conflicts.
- Make sure `Command+Space` is not still assigned to Spotlight.
- Confirm that LUNA itself responds to the expected keyboard shortcut from the Mac keyboard.

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build and package the desktop app:

```bash
npm run desktop:package
```

## Release Artifacts

Packaged output is written to:

- `release/LUNA Studio Remote-1.0.0-arm64.dmg`
- `release/LUNA Studio Remote-1.0.0-arm64-mac.zip`
- `release/mac-arm64/LUNA Studio Remote.app`

## Tech Stack

- Electron
- React
- Vite
- Express
- TypeScript
- electron-builder

## Disclaimer

LUNA Studio Remote is an independent companion utility. It is not affiliated with, endorsed by, or supported by Universal Audio.

Use it at your own discretion during recording sessions, and test your workflow before relying on it in a critical take.
