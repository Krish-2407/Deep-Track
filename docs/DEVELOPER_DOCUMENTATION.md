# Deep Track - Developer Documentation (v1.2.3)

This document provides a technical overview of the Screen Monitor architecture, feature implementation, packaging, and dependency management.

## Tech Stack
- **Core**: Electron.js (v30.0.0+)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom Design Tokens)
- **Visualization**: Chart.js (v4.5+)
- **Ad-Blocking**: `@ghostery/adblocker-electron`
- **Distribution**: `electron-updater` (Auto-updates via GitHub Releases)
- **OS Interaction**: 
    - `active-win`: Window tracking.
    - `loudness`: Native system volume control.
    - `media-control.exe`: Custom high-performance C# binary for instant media key injection.
    - `PowerShell`: System tweaks, notification sound back-ups, and registry management.

## Architecture Overview (Modular Reconstruction)

The application has been refactored into a modular architecture to improve maintainability and scalability:

- **`main.js`**: The process orchestrator. Manages application lifecycle, window creation, system-level locks, background screen time polling, and **Auto-Updates** (`electron-updater`).
- **`overlay.js`**: Controls the Floating Focus Bubble. Manages translucency, movement, and session state synchronization.
- **`renderer.js`**: A thin orchestration layer. Initializes core modules and handles high-level view switching.
- **`preload.js`**: The security bridge. Exposes controlled IPC methods to the renderer via `contextBridge`.
- **`modules/`**: Contains the core business logic separated by domain (Analytics, Dashboard, Session, etc.).
- **`components/`**: Houses reusable UI components like the Timer and Media Controls.
- **`data/`**: Manages persistence via specialized store modules (`SessionStore`, `ZenStore`).

## Core Modules & Implementation

### 1. Floating Focus Bubble (`overlay.js` / `overlay.html`)
The distraction-free overlay system.
- **Translucency**: Uses Electron's `transparent: true` and `frame: false` for a premium glass look.
- **Movement**: Custom IPC handlers for dragging the bubble without standard window decorations. 
- **Pointer Capture & Screen Bounds**: Uses HTML5 Pointer Capture to prevent mouse slip during dragging, and constrains coordinate updates to the physical screen boundaries (`display.bounds`) rather than the taskbar-constrained workArea.
- **State Sync**: Real-time synchronization with the main timer engine using IPC events.

### 2. Auto-Update System (`main.js`)
Handles background updates from GitHub.
- **Silent Download**: Automatically downloads updates in the background.
- **Verification**: Uses `latest.yml` to verify file integrity and version compatibility.
- **Trigger**: Checked on app startup and via periodic polling.

### 3. Media & Volume Integration (`components/media-controls.js`)
Handles interactive system-level media and audio control.
- **High Performance**: Uses a compiled C# executable (`media-control.exe`) to bypass PowerShell latency.
- **Native Volume**: Interfaces with the `loudness` package for real-time master volume synchronization.

### 4. Analytic Studio (`modules/analytics.js`)
Handles complex data visualization.
- **Engine**: Powered by Chart.js.
- **Rolling History**: Implements a 10-session limit for "Recent Sessions" to maintain performance and prepare for premium tiering.

### 5. Ambient Sound Chime & Serene Breaks (`components/timer-ui.js`)
Handles programmatic Web Audio API synthesis, segmented control layouts, break theme shifts, and adaptive OS desktop alerts:
- **Audio Chime Synthesis**: A zero-dependency programmatic synthesizer using Web Audio API oscillators. Synthesizes a warm E5 -> G#5 sine wave dual-tone arpeggio on focus completion (break start) and an ascending C5 -> E5 -> G5 -> C6 triangle wave arpeggio on break completion.
- **Cozy Amber Break Theme**: Dynamically overrides standard electric focus purple with cozy golden-amber variables (`--primary: #f59e0b`, `--primary-glow`) on the body when in break mode, causing the timer progress ring and UI accents to seamlessly morph.
- **Adaptive OS Alerts**: Smart notification system that fires native OS notification bubbles *only* when the application window is minimized or blurred in the background (`document.hidden || !document.hasFocus()`), preventing redundant alerts when active.
- **Strict Lockdown Enforcement**: Enforces `SessionState.useAudio = false` in strict mode to bypass sound chimes, ensuring fullscreen visual blackout and complete Electron lockdowns are active.

### 6. Daily Focus Targets & Settings Engine (`modules/settings.js` / `data/settings-store.js`)
Handles centralized application settings, local persistence, startup hooks, and daily focus calibration:
- **Unified Settings Card**: Redesigned settings view consolidating General, Audio, Strict, and Data options into a single high-fidelity page layout.
- **Custom Steppers**: Inputs for targets/durations are handled by custom steppers displaying formatted strings (e.g., `4.0 hrs`, `5 mins`) with backing values.
- **Floating overlay toggle**: Dynamic setting `showOverlayDuringSession` allows disabling the floating Focus Bubble timer entirely.
- **Auto-Launch Persistence**: Connects directly with Electron `ipcMain` startup hooks to toggle minimized tray starting on OS boot, utilizing verified absolute executable paths for Windows Registry reliability.
- **Global Daily Target**: Real-time integration with focus tracking engines to dynamically recalculate and display daily target completions (e.g., 4-hour focus goals).
- **Data Export & Factory Reset**: Enables JSON-format backups of all session logs, Zen notes, checklist tasks, and user configurations, plus confirmation-secured factory wipes.

### 7. Support & Feedback Engine (`modules/support.js`)
An in-app, secure diagnostic communication panel for alpha testers:
- **Sanitized Submission**: Uses DOMPurify to clean user feedback descriptions before copying or dispatching, securing against XSS.
- **Diagnostics Package**: Bundles real-time platform matching, active Strict Session states, total completed sessions, and user agent metrics.
- **Secure Link Delegation**: Implements `setWindowOpenHandler` in `main.js` to securely direct external HTTP/HTTPS and mailto clicks (Discord server join, email client launch) out of Electron directly into the user's default OS browser.
- **Discord Webhook embeds & Clipboard Backup**: Automatically posts rich embeds to a Discord channel if `sm_feedback_webhook` is set in local storage; falls back to copying a formatted system bug report to the clipboard and raising a glassmorphic toast notification.

### 8. Live OS Media Session listener (`main.js` / `components/media-controls.js`)
Connects with low-level Windows WinRT services to continuously query and display active media tracks:
- **Real-Time Display**: Streamlines playback data to dashboard screens and overlay panels, updating live song titles and artist names instantly.

### 9. System Integration & Self-Healing (`main.js`)
Provides robust cleanup behaviors during uninstallations and exits:
- **Registry Sound Blackout**: Implements a sound-backup cmdlet in `toggleNotifications` that backs up registry audio configuration from `HKCU:\AppEvents\Schemes\Apps\.Default` to `HKCU:\Software\DeepTrack\BackupSounds` and silences notification sounds during focus sessions. Restores settings instantly when focus sessions finish.
- **Missing-File Detection (Startup Healing)**: Checks for the existence of `index.html`, `preload.js`, and `renderer.js` on startup. If they are missing (indicating the user deleted the installation folder while the app was locked/running in background), the app automatically cleans its startup registry key (`openAtLogin: false`) and terminates silently.
- **Cross-Close Quit**: Window close event (X button) terminates the entire application and executes all database syncs and registry sound restoration sweeps, rather than minimizing to tray.
- **Uninstaller Registry Cleanup**: Integrates a custom NSIS script (`build/installer.nsh`) that force-terminates any running `Deep Track.exe` processes and deletes the Windows Startup Run registry entries (`deep-track` and `Deep Track`) to prevent orphaned startup records on uninstallation.


## Data Persistence
- **`localStorage`**: Used for session logs and Zen notes.
- **`screentime.json`**: File-based storage in `userData` for background tracking logs.

## Design System: Obsidian Flow
The UI uses custom CSS tokens in `style.css`, including electric purple, functional teal, and deep obsidian colors. 
- **Glassmorphism**: Achieved via `backdrop-filter: blur(30px)` and layered border alphas.

## Build Pipeline
1. **Production Build**: `npm run dist` creates the NSIS installer and `latest.yml` for updates.
2. **Protected Build**: `npm run dist-beta` (Legacy/Experimental obfuscation path).
3. **Distribution**: Upload `.exe`, `.blockmap`, and `latest.yml` to GitHub Releases for auto-update functionality.

## Development Setup
1. `npm install`
2. `npm start` (Standard dev mode).
3. `npm run dev` (Starts Electron with **Hot-Reloading** enabled).

