# Deep Track — Deep Work Studio (v1.2.3)

Deep Track is a premium, high-performance productivity engine designed for elite focus. It transforms your workstation into a distraction-free sanctuary by combining high-precision timing, system-level notification suppression, and an immersive study environment.

## Core Philosophy: The Obsidian Flow UI
Deep Track follows the "Obsidian Flow" design philosophy. Utilizing a deep charcoal, electric purple, and teal aesthetic, the app minimizes visual noise to keep your brain in a state of flow. The interface uses high-end glassmorphism and sidebar-driven navigation to provide a professional, tool-first experience.

## Key Features

### 1. Floating Focus Bubble
The ultimate productivity companion that stays with you:
- **Movable Overlay**: A translucent, distraction-free timer that floats on top of all your applications.
- **Dynamic Control**: Expand the bubble to access session controls or collapse it into a minimal focus ring.
- **Zero Friction & Screen Bounds**: Drag the bubble anywhere on your screen up to the physical edges. Uses HTML5 Pointer Capture for precise tracking, preventing drag-stutter or pointer slippage.

### 2. Active Session Mode (Obsidian Flow)
The core immersion engine:
- **High-Precision Timer**: A prominent, countdown with a sleek progress ring, now drift-free for maximum accuracy.
- **Integrated Volume Control**: Adjust system volume directly from the session view using a sleek, vertical glassmorphism slider.
- **Dynamic Checklist**: Integrated task management within the focus view to keep you on track without context switching.
- **Session Intelligence**: Tracks completion rates and focus duration for every task in real-time.

### 3. Strict Protocol (Deep Focus Mode)
For sessions where focus is non-negotiable:
- **Full-Screen Lockdown**: The app takes over the entire display, disabling the taskbar and system distractions.
- **Immersive WebView**: Loads your study link in a custom browser that kills ads and cleans the UI of distracting elements.
- **Security Hardening**: Implements strict URL validation and interaction shields to prevent accidental navigation.

### 4. Analytic Studio & History
A state-of-the-art data engine built with **Chart.js**:
- **Activity Heatmaps**: Visualizes your focus intensity over a 4-week window.
- **Focus Distribution**: 7-day and 14-day trends showing exactly how much time you spend in flow.
- **Optimized History**: Tracks your recent focus sessions with a refined 10-session rolling history.

### 5. Zen Notes & Flow State
- **Zen Journaling**: A built-in scratchpad for capturing thoughts without leaving the focus environment.
- **Persistent Storage**: All notes are saved instantly and accessible across sessions.

### 6. System-Level Integration & Security
- **Silent Auto-Updates**: The app automatically pulls the latest improvements and security patches in the background. Now optimized with build-time and programmatic signature bypasses to support seamless updating for unsigned indie releases.
- **Instant Media Engine**: High-performance native control (using `media-control.exe`) for zero-latency media management.
- **Notification Block**: Registry-level suppression of Windows notifications during active sessions.

### 7. Serene Breaks & Ambient Chimes (v1.2.2)
- **Flexible Notification Mode**: Toggle between a visual fullscreen blackout overlay and a serene, arpeggiated audio chime.
- **Web Audio API Synth Engine**: Programmatically synthesizes zero-latency focus-complete arpeggios (E5 -> G#5 arpeggio) and break-complete arpeggios (C5 -> E5 -> G5 -> C6) for high-fidelity cues.
- **Amber Cozy Rest Theme**: Accents and timer progress rings automatically morph from electric focus purple to serene amber-gold (`#f59e0b`) during break periods, fostering mental restoration.
- **Adaptive OS Popups**: Smart notification system that fires native OS alerts only when the browser window is minimized or blurred in the background, keeping active sessions distraction-free.

### 8. Centralized Settings Control (v1.2.3 - NEW)
An ultra-premium consolidated Settings view:
- **Unified Design**: Replaces the multiple layout configurations with a single page layout displaying all configurations clearly categorized (General, Focus & Audio, Strict Protocol, Data Management).
- **Custom Steppers**: Duration and target configurations utilize premium interactive steppers that display clean, human-readable numbers (e.g., `4.0 hrs`, `5 mins`).
- **Overlay Toggle**: Option to enable or disable the floating Focus Bubble timer overlay from rendering during sessions.
- **Auto-Launch OS Integration**: One-click startup configuration toggling, seamlessly integrating with standard Windows auto-run registry hooks.
- **Global Goal Sync**: Set your global focus target and break lengths directly in settings to automatically initialize dashboard widgets and track daily completion rates without manual entry.

### 9. Alpha Release Feedback Hub (v1.2.2 - NEW)
A built-in diagnostic and bug reporting ecosystem:
- **Interactive Emoji Selector**: Integrated satisfaction ratings (from terrible to amazing 🚀).
- **Secure Diagnostic Bundler**: Gathers and displays App Version, OS Platform, total session counts, and Strict Mode status, secured via DOMPurify to defend against XSS.
- **Automated Webhooks**: Direct secure POST integration with Discord Webhook developer streams.
- **Fail-Safe Clipboard Compiler**: Formats a detailed system and bug report, saves it automatically to the user's system clipboard, and raises an elegant glassmorphic toast notification showing complete delivery status.

### 10. Robust OS Integration & Self-Healing (v1.2.3 - NEW)
- **Audio Notification Mute**: Backs up and silences Windows notification and call alarms during focus sessions, restoring them instantly when the session ends.
- **Startup Self-Healing**: Detects if the app has been deleted while running in the background. Cleans up startup registry entries and exits silently to prevent startup crash popup boxes.
- **Cross-Close Quit**: Reconfigures the close window button (X) to terminate the app completely rather than minimizing/hiding to tray, guaranteeing all resources are released.
- **Updater Signature Bypass**: Bypasses Windows update code signature checks programmatically and via build configuration to ensure that unsigned updates install cleanly.
- **Native Rebuild Bypass**: Configures installer packaging to skip local native rebuild steps, avoiding dependencies on local Visual Studio compiler toolchains and preventing build failures.

## Production Ready
Deep Track is distributed as a professional Windows installer (`.exe`) with a high-resolution custom icon. Release builds are optimized for stability and security, ensuring a premium experience for every user.

