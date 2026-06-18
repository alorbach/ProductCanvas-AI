# Getting Started

This chapter walks you through installation, Codex CLI login, and creating your first image with ProductCanvas AI. By default the app uses **Direct CLI** (`codex exec` on your PC). Optionally you can switch to [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) in **File → Preferences**.

## System requirements

- **Windows 10 or later** (64-bit)
- Internet access for initial Codex CLI setup and AI requests
- **Codex CLI** with an active login (`codex login`)
- **[Codex Local Bridge ≥ 1.0.4](https://github.com/alorbach/codex-local-bridge)** — only when using Bridge backend (reference images on `/v1/images` require this version; [releases](https://github.com/alorbach/codex-local-bridge/releases))

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

## First launch (Direct CLI — default)

When you start ProductCanvas AI, it checks whether **Codex CLI** is installed and signed in for your Windows user.

If Codex CLI is missing, the setup banner offers **Install Codex CLI** after you confirm. ProductCanvas uses the [official OpenAI Windows installer](https://developers.openai.com/codex/quickstart) (`install.ps1`), then winget, then npm as fallbacks.

**ChatGPT subscription required:** Codex is included with ChatGPT Plus, Pro, Business, Edu, and Enterprise plans. Image generation uses your ChatGPT allowance — ProductCanvas does not sell or bundle a separate AI subscription.

1. If Codex CLI is missing, click **Install Codex CLI** in the banner and confirm.
2. Click **Sign in to Codex**, or run in PowerShell:

```powershell
codex login
```

2. Confirm the header status dot turns green (**Codex CLI ready**).

No bridge tray app or pairing code is required in Direct CLI mode.

## Optional: Codex Local Bridge

Switch to **Codex Local Bridge** in **File → Preferences** if you use the bridge with WordPress Gateway or prefer the tray app workflow.

When you start ProductCanvas AI with Bridge backend, it checks whether [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) is running at the configured URL (default `http://127.0.0.1:8765`).

If the bridge is not ready, a **setup banner** appears at the top of the window. The app may:

1. Download the latest [Codex Local Bridge release](https://github.com/alorbach/codex-local-bridge/releases) (cached under `%LOCALAPPDATA%\productcanvas-ai\bridge\`)
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

## Import your first template

Templates are **not bundled** with the app—you import your own layout masters (PNG, JPG, or WebP). On first launch the template list may be empty until you import one:

1. Go to **Create image**.
2. Click **Import template**, use **Templates → Import…**, or drag a PNG/JPG/WebP file onto the template list.
3. Imported templates are saved under `%APPDATA%\productcanvas-ai\templates\`.

## Create your first image

1. Open the **Create image** tab.
2. **Select a template** in the left panel (the last used template is pre-selected when available).
3. **Add reference images** – one or more photos of your product (button or drag-and-drop).
4. Optionally adjust **Image resolution**, **Quality**, and project fields (**Headline**, **Ad line 1**, **Ad line 2**).
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
