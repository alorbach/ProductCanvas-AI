# ProductCanvas AI – User Guide

ProductCanvas AI is a desktop application for Windows that turns layout templates and reference product photos into finished marketing images using local AI via [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge).

## Table of contents

1. [Getting Started](getting-started.md) – install, bridge pairing, Codex login, first image
2. [Create Image](create-image.md) – templates, references, project fields, generate, export
3. [Edit Templates](edit-templates.md) – import, clone, AI edit, accept/reject
4. [Settings](settings.md) – language, bridge URL, profiles
5. [Troubleshooting](troubleshooting.md) – bridge, pairing, timeouts, quality
6. [Product](product.md) – architecture, privacy, universal use
7. [Developer](developer.md) – dev setup, tests, CI, releases

## Overview

ProductCanvas AI combines three ideas:

- **Layout templates** define the visual frame (background, typography areas, accent elements).
- **Reference photos** describe the product you want to show.
- **Local AI** (Codex CLI through Codex Local Bridge) analyzes references, builds prompts, and generates or refines images—all on your PC.

Typical workflow:

1. Choose or import a template.
2. Add one or more reference product photos.
3. Fill in project fields (brand, series, tagline).
4. **Build prompt** to let AI analyze your product and draft an image prompt.
5. **Generate image** and review the preview.
6. Optionally **refine the preview with AI** (accept or reject changes).
7. **Save as PNG** to export the result.

## Main areas of the app

| Tab / area | Purpose |
|------------|---------|
| **Create image** | Day-to-day image production from template + references |
| **Edit templates** | Change layout templates with AI preview and accept/reject |
| **Help** | Built-in viewer for this documentation |

## Profiles and autosave

Your working session is restored automatically when you reopen the app:

- Selected template, reference images, prompts, and project fields
- Last preview path (when still available)

For named projects, use the **File** menu:

| Action | Shortcut |
|--------|----------|
| New profile | Ctrl+N |
| Open profile | Ctrl+O |
| Save | Ctrl+S |
| Save as | Ctrl+Shift+S |
| Recent profiles | File → Recent (up to 10 entries) |

Profiles are saved as `.pcprofile.json` files. Reference images are copied into a folder next to the profile file so projects remain portable. See [Settings](settings.md#profiles-pcprofilejson) for details.

## Bridge status indicator

The colored dot in the header shows Codex Local Bridge connectivity:

- **Green** – bridge connected and paired
- **Yellow / orange** – setup or sign-in needed
- **Red** – bridge unreachable

When setup is required, a banner appears at the top with pairing code entry and **Sign in to Codex**. See [Getting Started](getting-started.md).

## Help inside the app

Open the **Help** tab or use **Help → User Guide** in the menu. Documentation language follows your UI language setting (English or German).

## External dependencies

| Project | Role |
|---------|------|
| [ProductCanvas AI](https://github.com/alorbach/productcanvas-ai) | This desktop app |
| [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) | Local HTTP server; pairing, job forwarding to Codex CLI |
| **Codex CLI** | Command-line interface to AI models (install and sign in separately) |

Download bridge releases from [github.com/alorbach/codex-local-bridge/releases](https://github.com/alorbach/codex-local-bridge/releases) when not using the app’s automatic setup.

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
