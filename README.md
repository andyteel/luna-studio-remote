# Luna Companion

*Control LUNA from anywhere in your studio.*

**Luna Companion** lets you control Universal Audio's LUNA DAW from anywhere in your studio using your phone or tablet. Whether you're recording yourself across the room, sitting behind a drum kit, or dialing in a guitar tone away from your desk, Luna Companion puts the essential controls of LUNA right in your hand.

<img height="600" alt="lc-remote-server" src="https://github.com/user-attachments/assets/67c27bf5-8d14-4965-bd90-7305e47cb0f3" />
<img width="732" height="263" alt="lc-system-tray" src="https://github.com/user-attachments/assets/5ca1b5bf-0726-4e33-a32c-b97f36c8152f" />


## Features

### Transport Controls
- Play
- Stop
- Record
- Return to Zero
- Go to End
- Loop
- Click (Metronome)
- Count-In
- Pre/Post Roll Toggle
- Play From Stop Location
- Undo
- Redo
<img height="600" alt="lc-transport" src="https://github.com/user-attachments/assets/f7b7e118-09b3-4684-8606-624a37f124c0" />

### Focus Track Controls
- Record Arm
- Solo
- Mute
- Volume Fader
- Real-time Level Meter
- Previous Track
- Next Track
- Track Options
<img height="600" alt="lc-focus-track" src="https://github.com/user-attachments/assets/51e6e022-2599-455b-9053-59ddd49f7a5f" />

### Remote Experience
- Wireless control over your local network
- Optimized for phones and tablets
- Add to your device's Home Screen for an app-like experience
- Signed and notarized macOS application
- Lightweight companion server with built-in setup and connection status

> **Note:** Luna Companion combines Mackie Control (MCU) with macOS keyboard automation to provide access to more of LUNA's functionality than standard MIDI control alone.

---

# Installation

## Requirements

Before installing Luna Companion, make sure you have:

- A Mac running Universal Audio LUNA
- An iPhone, iPad, or other mobile device with a modern web browser
- Both devices connected to the same local network
- A configured IAC Driver in macOS Audio MIDI Setup
- LUNA configured to use the Luna Companion IAC ports

## Install Luna Companion

1. Download the latest DMG from the **Releases** page.
2. Open the DMG.
3. Drag **Luna Companion** into your **Applications** folder.
4. Launch Luna Companion.

The companion server window will open and display a QR code along with the address of your remote.

## Connect Your Device

1. Scan the QR code with your phone or tablet.
2. The remote interface will open in your browser.
3. Add the page to your Home Screen if desired.
4. Keep the Luna Companion server running while using the remote.

---

# First-Time Setup

Luna Companion uses both MIDI and macOS keyboard automation to provide the broadest possible control of LUNA.

Once setup is complete, you should not need to repeat these steps unless your MIDI configuration or macOS permissions change.

## 1. Configure the IAC Driver

Luna Companion communicates with LUNA through macOS's built-in IAC Driver.

If you have not already configured it:

1. Open **Audio MIDI Setup** on your Mac.
2. Open the **MIDI Studio** window.
3. Open the **IAC Driver**.
4. Enable the IAC Driver.
5. Create or verify the following ports:
   - **IAC Luna Companion From Luna**
   - **IAC Luna Companion To Luna**

## 2. Configure LUNA

Once the IAC Driver has been configured, assign the Luna Companion MIDI ports inside LUNA.

1. Open **Settings** in LUNA.
2. Select the **Controllers** tab.
3. In the first available control surface row, set the **Input Device** to **IAC Luna Companion To Luna**.
4. Set the **Output Device** to **IAC Luna Companion From Luna**.
5. Enable the controller by checking the **On** box.
6. Set **Surface Shows Tracks From** to **Focused Window**.

> **Recommended:** Setting **Surface Shows Tracks From** to **Focused Window** allows Luna Companion to follow the track selection in whichever LUNA window is currently active, keeping the Focus Track display synchronized as you work.

> **Note:** The Input and Output devices are intentionally reversed from the application's perspective. LUNA receives MIDI data from **IAC Luna Companion To Luna** and sends MIDI feedback to **IAC Luna Companion From Luna**.

## 3. Grant macOS Permissions

Some commands are sent using macOS keyboard automation because they are not available through Mackie Control.

The first time these commands are used, macOS may ask you to grant:

- **Accessibility** permission
- **Automation** permission

Grant these permissions when prompted. They only need to be approved once.

If keyboard-based commands do not respond, open:

**System Settings > Privacy & Security > Accessibility**

Then make sure **Luna Companion** is enabled.

## 4. Verify the Connection

With the Luna Companion server running:

1. Press **Play** or **Stop** in LUNA, or select a track.
2. The server window should indicate that MIDI is connected.
3. The remote should begin displaying the currently focused track name, level meter, and transport status.

If these indicators appear, Luna Companion is communicating successfully with LUNA and is ready to use.

---

# Using Luna Companion

Luna Companion is organized into two primary screens, each designed for a different part of the recording workflow.

## Transport Screen

The Transport screen gives you quick access to LUNA's primary recording, playback, and session navigation controls, making it easy to operate your session from anywhere in your studio.

### Recording & Playback

- Play
- Stop / Pause
- Record
- Loop
- Click (Metronome)
- Count-In
- Pre/Post Roll Toggle
- Play From Stop Location

The **Pre/Post Roll** button toggles both **Pre-Roll** and **Post-Roll** together, matching LUNA's keyboard shortcut. Individual Pre-Roll and Post-Roll settings can still be adjusted directly within LUNA.

When **Play From Stop Location** is enabled, the **Stop** button changes to a **Pause** button. Instead of returning to the previous start position, playback resumes from the exact point where playback was paused.

### Timeline Navigation

- Return to Zero
- Go to End
- Previous Marker
- Next Marker
- Create Marker
- Previous Bar
- Next Bar

### Editing

- Undo
- Redo

## Focus Track Screen

The Focus Track screen gives you quick access to the currently selected track in LUNA. Whether you're recording yourself across the room or making quick adjustments during a session, the Focus Track screen keeps the most important controls close at hand.

### Track Controls

- Record Arm
- Solo
- Mute
- Volume Fader
- Real-time Level Meter

The Focus Track screen automatically follows the currently selected track in LUNA, allowing you to arm tracks, adjust levels, and monitor signal without returning to your computer.

### Track Navigation

- Previous Track
- Next Track

Quickly move between tracks in your session while keeping your hands on your instrument.

### Track Options

<img height="600" alt="lc-track-options" src="https://github.com/user-attachments/assets/7a8af4a3-c0a1-4de5-a941-ac66db1c1566" />

The **+** button opens a menu of convenient track actions, allowing you to create new recording destinations or duplicate your current track without interrupting your workflow.

Available options include:

- **New Track Version**
- **Duplicate Track with Content**
- **Duplicate Track without Content**

#### New Track Version

Creates a new track version on the current track, allowing you to record additional takes while preserving previous performances. This is LUNA's non-destructive way of capturing multiple takes on the same track.

#### Duplicate Track with Content

Creates a new track containing the current track's audio along with its channel settings, plugins, routing, and sends.

#### Duplicate Track without Content

Creates a new track with the same channel settings, plugins, routing, and sends, but without copying the recorded audio. This is useful when you want another recording track with the same setup while starting with an empty timeline.

## Home Screen Installation

For the best experience, add Luna Companion to your phone or tablet's Home Screen. This launches the remote in a full-screen, app-like view without browser controls and provides quick access for future sessions.

---

# How Luna Companion Works

Luna Companion combines two methods of controlling LUNA to provide a richer remote experience than MIDI alone.

## Mackie Control (MCU)

Whenever possible, Luna Companion communicates with LUNA using the Mackie Control (MCU) protocol. This provides real-time feedback for features such as:

- Transport status
- Focus Track selection
- Record Arm
- Solo
- Mute
- Volume
- Level metering

Because these functions are driven by MIDI feedback from LUNA, the remote reflects the current state of your session.

## macOS Keyboard Automation

Some LUNA features are not available through the Mackie Control protocol. For those functions, Luna Companion uses macOS keyboard automation to trigger the same commands you would use from your keyboard.

Examples include:

- Undo / Redo
- Return to Zero
- Go to End
- Marker navigation and creation
- Count-In
- Pre/Post Roll
- Play From Stop Location
- Track Options

This hybrid approach allows Luna Companion to provide access to significantly more of LUNA's functionality than would be possible using MIDI alone.

---

# Known Limitations

Luna Companion combines Mackie Control (MCU) with macOS keyboard automation to provide access to more of LUNA's functionality than MIDI control alone. While this enables a much richer remote experience, there are a few limitations imposed by LUNA itself.

## Play From Stop Location

LUNA does not provide feedback indicating whether **Play From Stop Location** is enabled.

To provide visual feedback, Luna Companion maintains this button's state locally. When enabled, the **Stop** button changes to a **Pause** button to indicate that playback will resume from the point where it was stopped.

If **Play From Stop Location** is changed directly within LUNA, the remote's indicator may become temporarily out of sync. Simply toggle the function again from the remote or within LUNA to resynchronize the indicator.

## Count-In

The **Count-In** button toggles LUNA's Count-In function on or off using LUNA's keyboard shortcut.

The remote does not set the Count-In length. If you want a 1-bar, 2-bar, or 4-bar count-in, set that preference inside LUNA first. Luna Companion will then toggle Count-In on or off using LUNA's current setting.

Because LUNA does not provide feedback for this state over MCU, the remote's Count-In indicator may become temporarily out of sync if Count-In is changed directly inside LUNA.

## Pre/Post Roll

The **Pre/Post Roll** button maintains its state locally because LUNA does not expose its current status through MCU.

LUNA's keyboard shortcut toggles **Pre-Roll** and **Post-Roll** together. For that reason, the remote controls them as a single combined function rather than as separate switches.

If Pre-Roll or Post-Roll is changed directly within LUNA, the remote's indicator may become temporarily out of sync. Toggle the function again from the remote or within LUNA to resynchronize the indicator.

## Keyboard-Based Commands

Some Luna Companion functions are performed using macOS keyboard automation because they are not available through Mackie Control.

These commands require:

- Accessibility permission
- Automation permission

These permissions are requested by macOS the first time they are needed and only need to be granted once.

## Multiple LUNA Windows

Commands that use macOS keyboard automation are sent to whichever LUNA window currently has focus.

For example, if both the Mixer and Timeline windows are open, make sure the window you want to control is the active window before using keyboard-based commands.

MCU-based functions, including transport status, Focus Track updates, and level metering, continue to operate normally.

---

# Troubleshooting

## The remote won't connect

- Make sure your computer and mobile device are connected to the same local network.
- Verify that the Luna Companion server is running.
- Try scanning the QR code again or manually enter the Remote URL displayed in the server window.
- If needed, restart the Luna Companion server.

## MIDI is not connected

Verify that:

- The IAC Driver is enabled in macOS Audio MIDI Setup.
- LUNA is configured to use the Luna Companion IAC ports.
- The controller is enabled in **Settings > Controllers**.
- **Surface Shows Tracks From** is set to **Focused Window**.

Press **Play**, **Stop**, or select a track in LUNA. The server should indicate that MIDI communication has been established.

## Keyboard commands don't respond

Some commands rely on macOS keyboard automation.

If commands such as **Undo**, **Redo**, **Track Options**, or timeline navigation do not respond:

- Verify that Accessibility permission has been granted.
- Verify that Automation permission has been granted.
- Restart Luna Companion after granting permissions if necessary.

## Track information doesn't update

If the Focus Track screen does not follow your selection:

- Confirm that **Surface Shows Tracks From** is set to **Focused Window** in LUNA's **Controllers** settings.
- Click the track you want to control in LUNA.

## Button indicators don't match LUNA

The following buttons maintain their state locally because LUNA does not provide MCU feedback for them:

- Count-In
- Pre/Post Roll
- Play From Stop Location

If one of these indicators becomes out of sync, simply toggle the function again from the remote or directly within LUNA to restore synchronization.

## Keyboard commands affect the wrong window

If multiple LUNA windows are open, keyboard-based commands are sent to the window that currently has focus.

Click the desired LUNA window before using keyboard-based commands.

---

# Tutorial Video

A complete installation, setup, and walkthrough of Luna Companion is available on YouTube.

**Watch the tutorial:** 
https://youtu.be/KysxiVoA4lI

---

# Feedback

Luna Companion was built to solve a real workflow challenge in my own studio, and I hope it makes recording with LUNA more enjoyable for you as well.

If you encounter a bug, have an idea for a new feature, or would like to share feedback, please open an issue on GitHub. I'd love to hear how you're using Luna Companion in your own workflow.

---

# Acknowledgments

Luna Companion was created independently by Andy Teel to extend the remote control capabilities of Universal Audio's LUNA DAW.

LUNA is a trademark of Universal Audio, Inc. Luna Companion is an independent project and is not affiliated with, endorsed by, or sponsored by Universal Audio.
