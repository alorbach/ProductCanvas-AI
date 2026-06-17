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

## Bridge URL

Default: `http://127.0.0.1:8765`

Change this only when:

- Codex Local Bridge listens on a non-default host or port
- You run multiple bridge instances and need a specific endpoint

After saving, ProductCanvas AI uses the new URL for status checks and all AI requests. If a session is open, its stored `bridgeUrl` field updates as well.

Ensure the URL has no trailing slash. Use `http://` for local bridge instances unless your bridge documentation specifies HTTPS.

## Project settings (Create image tab)

These settings are part of your **session** and **profiles**, not the Settings window:

| Setting | Stored in session/profile |
|---------|---------------------------|
| Template selection | Yes |
| Reference images | Yes (paths; copied on profile save) |
| Image resolution / quality | Yes |
| Product category, brand, series, tagline | Yes |
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
    "referenceImages": [{ "path": "...", "name": "..." }],
    "imagePrompt": "...",
    "...": "..."
  }
}
```

When you save a profile to `Campaign.pcprofile.json`, reference images are copied into a sibling folder `Campaign/` next to the JSON file. This keeps profiles portable when you move them to another PC or back them up.

### What profiles include

- Template ID and mode
- All reference image paths (rebased on save)
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
| System templates | Inside the app installation (`assets/templates/`) |

On first run after upgrading from an older app name, user data may migrate automatically into `productcanvas-ai` if the new folder was empty.

## Debug log

The footer **Debug log** panel records bridge calls, attachment modes, and errors. Use **Copy** to share diagnostics when reporting issues. See [Troubleshooting](troubleshooting.md).

## Related topics

- [Getting Started](getting-started.md) – initial bridge pairing
- [Create Image](create-image.md) – project fields explained
- [Developer](developer.md) – preference files in development builds

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
