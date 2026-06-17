# Edit Templates

The **Edit templates** tab lets you adapt layout templates using natural-language instructions and AI-generated previews. You always review changes before they are saved.

## Template types

| Type | Location | Editable? |
|------|----------|-----------|
| **System templates** | Shipped in the app bundle | Read-only – **clone** to create an editable copy |
| **User templates** | `%APPDATA%\productcanvas-ai\templates\` | Full edit, rename, delete |

System templates are never modified in place. Accepting an AI edit on a system template automatically saves a **new user template**.

## Overview of the editor

The template editor is split into:

- **Original** – current saved template image
- **AI preview** – result of the last generation (empty until you generate)
- **Controls** – change request, output format, optional reference image, action buttons

When an AI preview is pending, the template is **locked** until you **Accept change** or **Reject change**.

## Import a template

Start from any PNG/JPG/WebP layout:

1. **Templates → Import…**, the **Import template** button on the Create image tab, or drag-and-drop onto the template gallery.
2. The file is copied to your user templates folder and appears under **Your templates**.

Imported templates are ideal starting points for brand-specific layouts.

## Clone a system template

1. Select a system template in the gallery or the **Current template** dropdown.
2. Choose **Clone** from the context menu or **Templates → Clone**.
3. A user copy is created with a new name; edit the clone freely.

## AI edit workflow

### 1. Select the template

Pick the template to modify in the editor dropdown. The original image loads on the left.

### 2. Describe the change

In **Change request**, describe what should change in plain language. Examples:

- “Change the accent frame from blue to red”
- “Make the header logo 20% larger”
- “Darken the background gradient”
- “Move the contact bar to the bottom edge”

You can also change **Output format** (resolution) without a textual change—select a different size and generate to produce a resized variant.

### 3. Optional reference image

Add a **reference image** when your change request refers to a mood, texture, or background from another photo:

- Drag an image into the reference drop zone, or use **Add reference image**.
- Mention it in the change request, e.g. “Use the warm studio lighting from the reference”.

### 4. Optimize prompt

Click **Optimize prompt** (or proceed directly to generation—the pipeline optimizes internally). The AI analyzes the template and your request, producing a precise edit prompt shown in the prompt area. Adjust it if needed before applying.

### 5. Generate AI preview

Click **Generate AI preview**. The wait dialog tracks prompt optimization and image generation.

When finished, the **AI preview** panel on the right shows the proposed result. Use **Compare fullscreen** to view original and preview side by side.

### 6. Accept or reject

| Button | Effect |
|--------|--------|
| **Accept change** | Saves the preview as the new template version (user folder). System templates become new user templates. |
| **Reject change** | Discards the preview; original template unchanged |

After accept, the preview becomes the new **Original** for further edits.

## Version history

When you accept an edit on an **existing user template**, the previous version is archived under:

```
%APPDATA%\productcanvas-ai\templates\history\<template-id>\
```

This lets you recover earlier artwork manually if needed. History is not exposed in the UI; browse the folder with File Explorer.

## Rename and delete

Right-click a **user template**:

- **Rename…** – change display name
- **Delete** – remove template and registry entry (confirmation dialog)

System templates cannot be deleted.

## Output format in the editor

**Output format** and **Quality** in the editor mirror Create image settings. They control the resolution of the AI preview and saved template.

- **Template (WxH)** – native template dimensions
- **Template ×2** – double resolution for high-DPI layouts
- Fixed sizes (1024×1024, 1536×1024, etc.) – standard API presets

If you only need a different size without visual changes, select a new output format and generate without a change request.

## Best practices

- **One change at a time** – smaller requests produce more predictable previews.
- **Clone before experiments** – keep a known-good user template as backup.
- **Accept only when satisfied** – rejected previews cost time but protect your library.
- **Import high-resolution masters** – editing downscales less gracefully than editing at full size.

## Related topics

- [Create Image](create-image.md) – use edited templates in production
- [Troubleshooting](troubleshooting.md) – AI edit failures or slow previews
- [Product](product.md) – how template storage is organized

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
