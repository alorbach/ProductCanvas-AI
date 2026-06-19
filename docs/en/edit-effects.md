# Edit Effect Images

The **Edit effects** tab lets you adapt your imported or AI-generated effect/background images using natural-language instructions and AI-generated previews via [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge). You always review changes before they are saved.

## Your effect library

All effect images live under `%APPDATA%\productcanvas-ai\effects\`. You import them as PNG, JPG, or WebP files, or generate new ones from text on the **Create image** tab.

| Action | Description |
|--------|-------------|
| **Import** | Add a new effect image from disk |
| **Generate** | Create a new effect from a text description (Create image tab) |
| **Rename** | Change the display name |
| **Delete** | Remove effect and file (with confirmation) |
| **Reorder** | Drag thumbnails in the gallery |
| **Edit…** | Open the effect editor for an existing effect |

## Overview of the editor

The effect editor is split into:

- **Original** – current saved effect image
- **AI preview** – result of the last generation (empty until you generate)
- **Controls** – change request, output format, optional reference image, action buttons

When an AI preview is pending, the effect is **locked** until you **Accept change** or **Reject change**.

## AI edit workflow

### 1. Select the effect

Pick the effect to modify in the editor dropdown or via **Edit…** in the effect card context menu. The original image loads on the left.

### 2. Describe the change

In **Change request**, describe what should change in plain language. Examples:

- “Intensify the flames and add more orange glow”
- “Shift the atmosphere from warm to cool blue”
- “Soften the smoke and reduce contrast”

You can also change **Output format** (resolution) without a textual change—select a different size and generate to produce a resized variant.

### 3. Optional reference image

Add a **reference image** when your change request refers to a mood, texture, or lighting from another photo:

- Drag an image into the reference drop zone, or use **Add reference image**.
- Mention it in the change request, e.g. “Match the warm studio lighting from the reference”.

The optional editor reference path is stored in your session (`effectEditorReferenceImagePath`) so thumbnails reload after restart.

### 4. Generate AI preview

Click **Generate AI preview**. The wait dialog tracks prompt optimization and image generation via the bridge.

When finished, the **AI preview** panel on the right shows the proposed result. Use **Compare fullscreen** to view original and preview side by side.

### 5. Accept or reject

| Button | Effect |
|--------|--------|
| **Accept change** | Saves the preview as the new effect version in your library |
| **Reject change** | Discards the preview; original effect unchanged |

After accept, the preview becomes the new **Original** for further edits.

## Version history

When you accept an edit on an **existing effect**, the previous version is archived under:

```
%APPDATA%\productcanvas-ai\effects\history\<effect-id>\
```

This lets you recover earlier artwork manually if needed. History is not exposed in the UI; browse the folder with File Explorer.

## Output format in the editor

**Output format** and **Quality** in the editor mirror Create image settings. They control the resolution of the AI preview and saved effect.

- **Effect (WxH)** – native effect dimensions
- Fixed sizes (1024×1024, 1536×1024, etc.) – standard API presets

If you only need a different size without visual changes, select a new output format and generate without a change request.

## Best practices

- **One change at a time** – smaller requests produce more predictable previews.
- **Accept only when satisfied** – rejected previews cost time but protect your library.
- **Import or generate at full resolution** – editing downscales less gracefully than editing at full size.

## Related topics

- [Create Image](create-image.md) – use effect images in product generation
- [Edit Templates](edit-templates.md) – similar workflow for layout templates
- [Troubleshooting](troubleshooting.md) – AI edit failures or slow previews
- [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) – local server for AI jobs

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
