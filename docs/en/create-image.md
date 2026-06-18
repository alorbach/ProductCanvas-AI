# Create Image

The **Create image** tab is where you combine a layout template, reference product photos, and project metadata into a finished PNG.

## Step-by-step workflow

### 1. Choose a template

The template panel lists **your imported templates** (PNG/JPG/WebP layout masters). If the list is empty, import a template first.

- Click a thumbnail to select it.
- The **last used template** is pre-selected when you start the app.
- Drag templates to reorder them in the gallery (order is saved for your convenience).

**Import a template:**

- Button **Import template**
- Menu **Templates → Import…**
- Drag PNG, JPG, or WebP onto the template list

Imported files are copied to `%APPDATA%\productcanvas-ai\templates\` and registered in your template library. See [Edit Templates](edit-templates.md) to clone, rename, or AI-edit layouts.

The template defines canvas size, background design, text areas, and optional category icons in the footer.

### 2. Add reference product images

Reference photos tell the AI what your product looks like. They are used in two phases:

1. **Build prompt** – detailed product analysis (shape, finish, components, count)
2. **Generate image** – attached to the bridge request so the model can reproduce the product faithfully

**Adding images:**

- Click **Add images**
- Drag files onto the reference list
- Right-click the list for **Add images…**

Supported formats: **PNG, JPG, WebP**.

**Tips:**

- Add **multiple angles** when one photo does not show all details.
- **Drag to reorder** – the first image is treated as the **main reference**.
- Remove thumbnails with the × button or context menu.

### 3. Project settings

The settings panel controls output options and text that appears on the layout.

| Field | Description |
|-------|-------------|
| **Image resolution** | Output size sent to Codex. **Template (WxH)** matches the selected template dimensions; **Template ×2** doubles them. Fixed presets (e.g. 1536×1024) are also available. |
| **Quality** | Low, Medium, or High – passed to the bridge like AI Gateway / PMS image settings. **High** is recommended for final exports. |
| **Headline** | Primary text line on the layout (e.g. brand or retailer). **AI suggestion** (sparkle icon) requires reference images. |
| **Ad line 1** | Second text line (e.g. series or model family). **AI suggestion** requires reference images. |
| **Ad line 2** | Third text line – short promotional phrase. **AI suggestion** requires reference images. |
| **Extra prompt** | Optional free-text hints for the AI, e.g. “keep product exactly as in reference, no shape changes”. |

Size and quality affect generation time and token cost on the Codex side. Template-based sizes keep the aspect ratio of your layout.

### 4. Build prompt

Click **Build prompt** (or **Build prompt** after changing references).

The app:

1. Sends your reference images to Codex via [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)
2. Runs product analysis on each reference (progress: “Analyzing product image X of Y…”)
3. Builds a structured **image prompt** with rules for layout fidelity and product accuracy
4. Fills **Headline**, **Ad line 1**, and **Ad line 2** when the analysis suggests values (you can edit them afterward)

The result appears in the collapsible **Image prompt** section. You can inspect it before generating. Re-run **Build prompt** after changing references or major project fields.

**Note:** When references are attached, a **preflight** step runs automatically during **Generate image** to merge template and product context into the final prompt sent to the image API. Until then, the prompt panel may show a placeholder indicating preflight happens at generation time.

### 5. Generate image

Click **Generate image**.

The wait dialog shows queue status, elapsed time, and the current phase:

- Preparing reference images
- Image preflight (optimizing prompt with references)
- Queued / Generating

Generation may take **from one minute to 30 minutes** depending on resolution, quality, and bridge load. **Cancel** aborts the active bridge job (not just the wait dialog).

When complete, the preview panel shows the result. Click the preview for fullscreen view (Esc to close).

### 6. Refine preview with AI

After generation, use **Edit with AI** below the preview:

1. Describe what should change in **Change request** (e.g. “change neon frame from blue to red”).
2. Click **Edit with AI**. The app optimizes the prompt and generates an edited preview via the bridge.
3. Use **Compare fullscreen** to view the original and edited result side by side.
4. **Accept change** keeps the edited preview as your working result, or **Reject change** restores the previous preview.

While a preview edit is pending, **Generate image** is locked until you accept or reject.

The last preview is **restored when you reopen the app**, as long as the temp file still exists under `temp-previews`. Pending accept/reject edits are restored as well.

### 7. Export

Click **Save as PNG** to export the preview to a location you choose. The export dialog suggests a filename; you can rename freely.

The preview file also lives temporarily under `%APPDATA%\productcanvas-ai\temp-previews\` until you save or start a new generation.

## Faithful product reproduction

ProductCanvas AI is designed to keep products close to your reference photos:

- Reference images are forwarded to Codex when the bridge supports attachments (Bridge **≥ 1.0.4**).
- Preflight merges template layout constraints with product analysis.
- Use **Extra prompt** to tighten rules when small details drift (material, grille pattern, driver count).

If the debug log warns that references were not forwarded, update [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) to the [latest release](https://github.com/alorbach/codex-local-bridge/releases).

## Autosave and profiles

Every change to template selection, references, prompts, and project fields is **autosaved** to `%APPDATA%\productcanvas-ai\session.json`.

For named, shareable projects, use **File → Save as…** to write a `.pcprofile.json` profile. See [Settings – Profiles](settings.md#profiles-pcprofilejson).

## Practical tips

| Goal | Suggestion |
|------|------------|
| Sharper product details | Add more reference angles; use High quality |
| Faster iteration | Lower quality or smaller fixed resolution for drafts |
| Better taglines | Short, one-line claims; use AI suggestion then edit |
| Layout-only experiments | Change template without rebuilding prompt if product unchanged |
| Repeatable campaigns | Save profiles per product line |

## Related topics

- [Edit Templates](edit-templates.md) – create or adapt layouts
- [Troubleshooting](troubleshooting.md) – timeouts, bridge errors, quality issues
- [Settings](settings.md) – [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) URL and language

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
