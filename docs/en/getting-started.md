# Getting Started

This chapter walks you through installation, Codex Local Bridge setup, Codex CLI login, and creating your first image with ProductCanvas AI.

## System requirements

- **Windows 10 or later** (64-bit)
- Internet access for initial Codex CLI / Bridge setup and AI requests
- **Codex CLI** with an active login
- **Codex Local Bridge ≥ 1.0.4** (reference images on `/v1/images` require this version)

ProductCanvas AI can download and start the bridge automatically on first use. You only need to enter a pairing code once.

## Installation

### Installer (recommended)

1. Download the latest `ProductCanvas-AI-*-win-x64.exe` from the [GitHub Releases](https://github.com/alorbach/productcanvas-ai/releases) page.
2. Run the installer and follow the prompts.
3. Launch **ProductCanvas AI** from the Start menu.

### Portable ZIP

1. Download the portable ZIP from Releases.
2. Extract to a folder of your choice.
3. Run `ProductCanvas AI.exe` from the extracted folder.

No administrator rights are required for normal use. The app stores settings under `%APPDATA%\productcanvas-ai\`.

## First launch

When you start ProductCanvas AI for the first time, it checks whether Codex Local Bridge is running at the configured URL (default `http://127.0.0.1:8765`).

If the bridge is not ready, a **setup banner** appears at the top of the window. The app may:

1. Download the latest Codex Local Bridge release (stored under `%LOCALAPPDATA%\productcanvas-ai\bridge\`)
2. Start the bridge process (look for the tray icon in the taskbar notification area)
3. Prompt you for a **pairing code**

## Codex Local Bridge pairing

Pairing connects ProductCanvas AI securely to your local bridge instance.

1. Open the **Codex Local Bridge** tray menu (system tray icon).
2. Copy the **6-digit pairing code** shown there.
3. Enter the code in ProductCanvas AI’s setup banner.
4. Click **Connect**.

After successful pairing, the header status dot turns green and the banner hides. Pairing data is stored in `%APPDATA%\productcanvas-ai\bridge-state.json` so you normally pair only once per machine.

If pairing fails:

- Confirm the bridge tray app is running.
- Check that no firewall blocks localhost ports **8765** (bridge HTTP) and **9473** (app origin used during pairing).
- Try restarting the bridge from the tray menu and enter a fresh code.

## Codex CLI login

The bridge forwards AI requests to **Codex CLI**. You must be signed in:

1. Click **Sign in to Codex** in the setup banner, **or**
2. Open PowerShell or Command Prompt and run:

```powershell
codex login
```

3. Complete sign-in in the browser when prompted.

If Codex CLI is not installed, ProductCanvas AI may attempt installation via **winget** or **npm** during bridge setup. You can also install Codex CLI manually from its official documentation.

When login is valid, the bridge status shows **Bridge ready** and prompt/image generation becomes available.

## Import your first template (if needed)

Built-in system templates ship with the app. If you start with an empty template list or want your own layout:

1. Go to **Create image**.
2. Click **Import template**, use **Templates → Import…**, or drag a PNG/JPG/WebP file onto the template list.
3. Imported templates are saved under `%APPDATA%\productcanvas-ai\templates\`.

## Create your first image

1. Open the **Create image** tab.
2. **Select a template** in the left panel (the last used template is pre-selected when available).
3. **Add reference images** – one or more photos of your product (button or drag-and-drop).
4. Optionally adjust **Image resolution**, **Quality**, and project fields (**Brand name**, **Series**, **Tagline**).
5. Click **Build prompt**. Wait while AI analyzes your reference photos and creates a structured image prompt. Progress appears in the wait dialog.
6. Review the generated **Image prompt** (expand the details section if collapsed).
7. Click **Generate image**. Generation can take several minutes depending on size, quality, and queue load.
8. When the preview appears, click **Save as PNG** and choose a destination folder.

Congratulations—you have completed the core workflow. For deeper control over each step, see [Create Image](create-image.md).

## Keyboard shortcuts (essentials)

| Shortcut | Action |
|----------|--------|
| Ctrl+, | Open Settings |
| Ctrl+S | Save profile |
| Ctrl+O | Open profile |
| Ctrl+N | New profile |

## Next steps

- [Create Image](create-image.md) – resolution, quality, tagline suggestions, export tips
- [Edit Templates](edit-templates.md) – customize layouts with AI
- [Settings](settings.md) – language and bridge URL
- [Troubleshooting](troubleshooting.md) – if something does not work

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
