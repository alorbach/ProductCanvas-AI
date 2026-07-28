# Settings

ProductCanvas AI separates **application preferences** (language, bridge URL) from **project settings** (resolution, brand fields on the Create image tab). This chapter covers both, plus profiles and data locations.

## Open the Settings window

- Menu **File → Preferences**
- Keyboard shortcut **Ctrl+,**

The Settings window is separate from the main project panel. Changes apply globally and are stored in `%APPDATA%\productcanvas-ai\defaults.json` (merged with built-in defaults).

## Language

| Option | Behavior |
|--------|----------|
| **Automatic (system)** | Uses Windows display language – German (`de`) or English (`en`); other locales fall back to English |
| **English** | Force English UI and help documentation |
| **German** | Force German UI and help documentation |

The Settings window shows **System language: …** when Automatic is selected so you can see which locale will be used.

UI strings live in the app’s i18n files; help content loads from `docs/en/` or `docs/de/` depending on the resolved locale.

Click **Save** to apply. The main window refreshes labels without restart.

## Codex backend

| Option | Behavior |
|--------|----------|
| **Direct CLI (default)** | ProductCanvas AI calls `codex exec` on this PC. Requires Codex CLI installed and signed in (`codex login`). No bridge tray app or pairing code. |
| **Codex Local Bridge** | Uses HTTP to [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge). Requires pairing and the bridge URL below. Useful if you already use the bridge with WordPress Gateway. |

Switch backends in **File → Preferences**. After changing, the status dot reflects the new path (Codex CLI ready vs. bridge paired).

## Bridge URL

Default: `http://127.0.0.1:8765` ([Codex Local Bridge](https://github.com/alorbach/codex-local-bridge))

Change this only when:

- [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) listens on a non-default host or port
- You run multiple bridge instances and need a specific endpoint

After saving, ProductCanvas AI updates:

- `%APPDATA%\productcanvas-ai\defaults.json`
- `%APPDATA%\productcanvas-ai\bridge-state.json` and the active bridge client
- The open session’s `bridgeUrl` field (if a session is loaded)

Only **`http://` and `https://`** URLs are accepted. Invalid values fall back to `http://127.0.0.1:8765`. Use no trailing slash.

This field is shown only when **Codex Local Bridge** is selected as the backend.

## Layout stage masks (experimental)

When a template defines a **product stage** rectangle, ProductCanvas AI can generate a PNG mask for that region during image generation. Mask inpainting is **not yet active** in the subscription Codex CLI path — the mask is prepared and logged for when Codex exposes `--mask` support. Until then, layout fidelity relies on prompt rules.

## Project settings (Create image tab)

These settings are part of your **session** and **profiles**, not the Settings window:

| Setting | Stored in session/profile |
|---------|---------------------------|
| Template selection | Yes |
| Reference images | Yes (paths; copied on profile save) |
| Image resolution / quality | Yes |
| Headline, ad lines, extra prompt | Yes |
| Extra prompt, image prompt, analysis fields | Yes |

They autosave to `%APPDATA%\productcanvas-ai\session.json` every few seconds while you work.

## Profiles (`.pcprofile.json`)

Profiles capture a complete project for reuse or sharing.

### Save and open

| Action | Shortcut | Description |
|--------|----------|-------------|
| New | Ctrl+N | Empty session with defaults |
| Open | Ctrl+O | Load `.pcprofile.json` or legacy `.wmprofile.json` |
| Save | Ctrl+S | Overwrite current profile file |
| Save as | Ctrl+Shift+S | Choose new path and name |

**File → Recent** lists up to **10** recently opened profiles.

### File format

A profile file is JSON with this structure:

```json
{
  "name": "Summer campaign",
  "version": 1,
  "savedAt": "2026-06-17T12:00:00.000Z",
  "settings": {
    "templateId": "...",
    "size": "template",
    "quality": "high",
    "brandName": "...",
    "seriesName": "...",
    "tagline": "...",
    "referenceImages": [{ "path": "...", "name": "...", "role": "detail" }],
    "imagePrompt": "...",
    "...": "..."
  }
}
```

When you save a profile to `Campaign.pcprofile.json`, reference images are copied into a sibling folder `Campaign/` next to the JSON file. This keeps profiles portable when you move them to another PC or back them up.

### What profiles include

- Template ID and mode
- All reference image paths (rebased on save)
- Optional template-editor reference path (`editorReferenceImagePath`)
- Prompts, fingerprints, and analysis text
- Project metadata and image settings
- Last preview path (if still valid)

Profiles do **not** include application language preference or global bridge URL unless those were part of the session export fields—use the Settings window for global prefs.

## Data storage locations

| Data | Path |
|------|------|
| Session (autosave) | `%APPDATA%\productcanvas-ai\session.json` |
| Defaults / preferences | `%APPDATA%\productcanvas-ai\defaults.json` |
| Bridge pairing state | `%APPDATA%\productcanvas-ai\bridge-state.json` |
| Recent profiles | `%APPDATA%\productcanvas-ai\recent.json` |
| User templates | `%APPDATA%\productcanvas-ai\templates\` |
| Template version history | `%APPDATA%\productcanvas-ai\templates\history\` |
| Temp previews | `%APPDATA%\productcanvas-ai\temp-previews\` |
| Bridge installer cache | `%LOCALAPPDATA%\productcanvas-ai\bridge\` |

On first run after upgrading from an older app name, user data may migrate automatically into `productcanvas-ai` if the new folder was empty.

## Debug log

The footer **Debug log** panel records bridge calls, attachment modes, and errors. Use **Copy** to share diagnostics when reporting issues. See [Troubleshooting](troubleshooting.md).

## Related topics

- [Getting Started](getting-started.md) – initial [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) pairing
- [Create Image](create-image.md) – project fields explained
- [Developer](developer.md) – preference files in development builds

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
