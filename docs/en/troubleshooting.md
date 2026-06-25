# Troubleshooting

This chapter helps you resolve common issues with [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge), pairing, long-running jobs, and image quality in ProductCanvas AI.

## Quick reference

| Symptom | First steps |
|---------|-------------|
| Red bridge status dot | Confirm bridge tray app is running; check URL in Settings |
| “Pairing required” banner | Enter fresh 6-digit code from bridge tray → **Connect** |
| “Codex sign-in required” | Run `codex login` or click **Sign in to Codex** |
| Codex CLI issues | **Codex → Status** → **Run checks**; copy diagnostics report for support |
| Prompt build fails | Verify references are valid PNG/JPG/WebP; check debug log |
| Generation timeout | Wait up to 30 min; cancel and retry; check bridge queue |
| Product looks wrong | Rebuild prompt; add references; tighten **Extra prompt** |
| References not applied | Update [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) to ≥ 1.0.4; check debug log attachment mode |

## Bridge not reachable

**Indicators:** Header dot red; message “Bridge unreachable”; errors mentioning port 8765 or “fetch failed”.

**Checks:**

1. Open the **[Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)** tray icon – if missing, restart ProductCanvas AI to trigger auto-setup, install from [releases](https://github.com/alorbach/codex-local-bridge/releases), or start the bridge manually from `%LOCALAPPDATA%\productcanvas-ai\bridge\`.
2. Confirm **Settings → Bridge URL** matches where the bridge listens (default `http://127.0.0.1:8765`).
3. Ensure no VPN or security software blocks **localhost** connections.
4. Restart the bridge from its tray menu, then restart ProductCanvas AI.

**Firewall:** Allow the bridge executable and ProductCanvas AI for private networks. Only local loopback is required for default setup.

## Pairing problems

**Indicators:** Yellow status; “Pairing required”; error “not paired with Codex Local Bridge”.

**Solution:**

1. In the bridge tray menu, show the current **pairing code** (6 digits).
2. Enter the code in ProductCanvas AI’s setup banner – codes expire; always use a fresh one.
3. Click **Connect**.
4. If pairing still fails, quit both apps, start bridge first, then ProductCanvas AI.

Pairing tokens are stored in `%APPDATA%\productcanvas-ai\bridge-state.json`. Deleting this file forces re-pairing (safe if the bridge also forgot the client).

## Codex CLI login

**Indicators:** “Codex sign-in required”; bridge ready but generation fails with auth errors.

**Solution:**

```powershell
codex login
```

Complete browser authentication. Verify with:

```powershell
codex --version
```

If CLI is missing, install via winget/npm or follow Codex CLI documentation. ProductCanvas AI’s setup flow attempts installation when possible.

## Codex CLI diagnostics

Open **Codex → Status** (or click the bridge status dot) to run built-in checks without starting a full image job.

**Run checks** (fast, no image quota):

- Verifies CLI binary, version, sign-in, `auth.json`, capabilities, rate limits, backend/bridge state
- Compares your version with **winget** (`OpenAI.Codex`) and suggests `winget upgrade --id OpenAI.Codex -e` when newer — prefer this over `codex update` on networks that rate-limit the GitHub API
- **Update Codex** runs that winget upgrade (npm fallback) after confirmation — does not call `codex update`
- Probes GitHub API reachability (informational)

**Run smoke test** (end-to-end):

- Sends a tiny text prompt and expects the token `PCAI_OK`
- Optionally includes a small image test (uses Codex quota; enable the checkbox)

Use **Copy report** to attach a plain-text summary to support email alongside the footer **Debug log**.

## Timeouts and long waits

Image and prompt jobs can run **up to 30 minutes** before the app reports a timeout. This is normal for high resolution and High quality.

**During generation:**

- Watch the wait dialog for **Queued**, **Generating**, and elapsed time.
- Check the bridge tray for active jobs or errors.
- Use **Cancel** to abort the active bridge job (not just close the dialog), then retry.

**Error codes (debug log):**

| Code | Meaning |
|------|---------|
| `BRIDGE_TIMEOUT` | No response within the configured window |
| `BRIDGE_HEADERS_TIMEOUT` | Bridge stopped sending progress mid-job |
| `BRIDGE_FETCH_FAILED` | Connection dropped or bridge not running |
| `codex_rate_limited` | Codex quota window has 0% remaining |

**Mitigation:**

- Reduce quality or resolution for test runs.
- Close other heavy bridge jobs.
- Restart bridge to clear a stuck queue.

## Prompt build failures

**Indicators:** “Could not build prompt”; empty image prompt after analysis.

**Checks:**

- At least one **reference image** is present (required for product analysis).
- Images are not corrupted; re-export from your photo tool.
- Bridge is paired and Codex is logged in.
- Open **Debug log** – look for HTTP or attachment errors.

ProductCanvas AI downscales large reference images (product, template, preview) before sending them to Codex. Codex CLI enforces a combined input limit of about 1 MB per turn; very large masters may still fail — use smaller exports if needed.

If you see **“body too large”**, the Bridge HTTP body was too large — reduce source dimensions or retry (references are downscaled automatically).

If you see **“input too large”** or **“exceeds the maximum length of 1048576 characters”**, Codex’s turn limit was exceeded — retry generation; the app scales references down before each attempt.

## Codex finished but no image file saved

**Indicators:** “Codex finished but no image file was saved”; debug log code `codex_no_image_output`; Codex exit status `0` but `new_image_count: 0`.

**Meaning:** Codex CLI reported success, but ProductCanvas could not find a new image file in `%USERPROFILE%\.codex\generated_images` or the temporary job workspace.

**Checks:**

1. Open `%USERPROFILE%\.codex\generated_images` — are there new PNG/JPG/WebP files from the same time?
2. Update Codex CLI (`codex --version`) and retry generation.
3. Ignore the stderr line **“Reading prompt from stdin…”** in the debug log — it is normal Codex status text, not the root cause.

**Mitigation:** Retry once after updating Codex. If it repeats, send the debug log (include `generated_images_dir`, `temp_dir`, and `image_source` if present).

## Image quality and fidelity

### Product differs from reference

1. Click **Build prompt** again after adding clearer reference photos.
2. Put the best overall shot **first** in the reference list.
3. Add to **Extra prompt**: “Reproduce product exactly as reference; do not alter drivers, finish, or proportions.”
4. Use **High** quality and template-native resolution for finals.

### Layout or text wrong

- Confirm the correct **template** is selected.
- Rebuild prompt after changing brand, series, or tagline.
- Preflight runs at generation time—always generate again after major prompt edits.

### References not forwarded

Debug log may show: “references in HTTP payload but not sent to Codex”.

**Fix:** Upgrade **[Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) to 1.0.4 or newer** ([releases](https://github.com/alorbach/codex-local-bridge/releases)). Older bridges ignore `/v1/images` attachments.

Successful forwarding is logged as “References forwarded to Codex (N attachments)”.

## Template editor issues

| Issue | Action |
|-------|--------|
| Template locked | Accept or reject pending AI preview |
| “Enter a change request…” | Type a change or pick different output format |
| Preview wildly wrong | Narrow the change request; clone template and retry |
| Cannot delete template | All imported templates can be deleted from the user library |

## Export and preview

- **Save as PNG** is enabled only after a successful generation.
- If preview is blank but generation succeeded, check `%APPDATA%\productcanvas-ai\temp-previews\`.
- Fullscreen preview: click image; **Esc** to close.

## Logs and support

1. Reproduce the issue once.
2. Open **Debug log** → **Copy**.
3. Note ProductCanvas AI version (**Help → About ProductCanvas AI…**).
4. Note bridge and Codex CLI versions from the bridge tray or terminal.

Report issues at [github.com/alorbach/productcanvas-ai/issues](https://github.com/alorbach/productcanvas-ai/issues).

## Related topics

- [Getting Started](getting-started.md) – clean setup from scratch
- [Settings](settings.md) – bridge URL and data paths
- [Create Image](create-image.md) – reference and prompt workflow

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
