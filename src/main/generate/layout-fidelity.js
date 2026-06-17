'use strict';

const LAYOUT_FROZEN_RULES = [
  'LAYOUT FROZEN ZONES (copy pixel-identically from IMAGE 2 / attached template):',
  '- Top-left logo, top-right brand title, contact bar, footer category icons and labels.',
  '- Exact text colors as shown in the template (e.g. white brand title — do NOT recolor to gold).',
  '- Neon side bars and accent color exactly as in the template.',
  '- Do NOT add category highlight boxes, gold frames, or new footer emphasis.',
  '- Do NOT change fonts in header/footer/contact areas.',
].join('\n');

const LAYOUT_EDITABLE_RULES = [
  'EDITABLE ZONE (product stage only):',
  '- Place products from IMAGE 1 only inside the central stage area.',
  '- Series name and tagline may appear in the stage text zone only.',
  '- Use colors and typography that match IMAGE 2 for stage product lines — do not force gold on header brand text.',
].join('\n');

function buildProductStageHint(template) {
  const stage = template?.productStage;
  if (!stage) {
    return 'Editable region: central product stage between header and contact bar only.';
  }
  return `Editable region (product stage only): x=${stage.x}, y=${stage.y}, width=${stage.width}, height=${stage.height} at ${template.width || 1536}x${template.height || 1024}px canvas.`;
}

function buildTemplateLayoutHint(template, options = {}) {
  if (!template) return '';
  const lines = [
    `Selected layout template: "${template.name}" (${template.importedFrom || template.file || 'user template'}).`,
  ];
  if (options.layoutImageAttached) {
    lines.push(
      'IMAGE 2 is authoritative for all frozen layout zones.',
      'Copy header, footer, contact bar, icon row, neon accents, and brand text colors exactly from IMAGE 2.',
    );
  } else {
    lines.push(`Accent hint: ${template.accentHex || template.accent}.`);
    lines.push(`Stage: ${template.stageHint || 'dark showroom with neon side bars'}.`);
  }
  lines.push(buildProductStageHint(template));
  if (template.headerBrandColor) {
    lines.push(`Top-right brand text color must stay ${template.headerBrandColor}.`);
  }
  return lines.join(' ');
}

function sanitizePreflightPrompt(prompt, options = {}) {
  let text = String(prompt || '').trim();
  if (!text) return text;

  const patterns = [
    /\bhighlight category[^.\n]*/gi,
    /\bgold typography for brand[^.\n]*/gi,
    /\badd gold[^.\n]*typography[^.\n]*/gi,
    /\b1990s futuristic font[^.\n]*/gi,
    /\bfuturistic font style[^.\n]*/gi,
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, '').trim();
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!options.allowGoldHeader && /\bgold\b.*\btele-kohlgraf\b/i.test(text)) {
    text = text.replace(/\bgold\b/gi, 'exact template color');
  }
  return text;
}

function appendLayoutLockBlock(prompt, template, imageSettings = {}) {
  const parts = [String(prompt || '').trim()];
  parts.push(LAYOUT_FROZEN_RULES);
  parts.push(LAYOUT_EDITABLE_RULES);
  if (template) {
    parts.push(buildProductStageHint(template));
  }
  const size = String(imageSettings.size || '').trim();
  if (size) {
    parts.push(`MANDATORY output size: ${size}. Do not use any other resolution.`);
  }
  parts.push('Do NOT redesign the template. Only merge products into the stage or apply the explicit user edit request.');
  return parts.filter(Boolean).join('\n\n');
}

function buildTemplateEditFrozenRules(changeRequest, imageSettings = {}) {
  const sizeLine = imageSettings.size
    ? `Target output size: ${imageSettings.size} (exact layout template dimensions). Do not change aspect ratio or canvas size.`
    : 'Keep exact template canvas dimensions.';
  return [
    'Edit the attached TELE-KOHLGRAF layout template image.',
    sizeLine,
    LAYOUT_FROZEN_RULES,
    'Only apply the user change inside allowed zones unless the user explicitly names a frozen element.',
    `User change request: ${changeRequest}`,
    'Return ONLY JSON: {"optimizedEditPrompt":"english image edit prompt","changeSummary":"short german summary","preservedElements":["..."]}',
  ].join('\n\n');
}

function buildResizeOnlyPrompt(template, imageSettings, sourceDims = {}) {
  const fromSize = sourceDims.width && sourceDims.height
    ? `${sourceDims.width}x${sourceDims.height}`
    : 'source template';
  const toSize = imageSettings.size === 'auto'
    ? 'auto (best fit for layout)'
    : imageSettings.size;
  const base = [
    `Resize the attached TELE-KOHLGRAF layout template from ${fromSize} to output size ${toSize}.`,
    'Preserve header, footer, contact bar, neon accents, icons, typography colors, and product stage layout.',
    'Scale the full design proportionally — do not redesign, recolor, or omit layout elements.',
    'No content changes — format / canvas size only.',
  ].join(' ');
  return appendLayoutLockBlock(base, template, imageSettings);
}

module.exports = {
  LAYOUT_EDITABLE_RULES,
  LAYOUT_FROZEN_RULES,
  appendLayoutLockBlock,
  buildProductStageHint,
  buildResizeOnlyPrompt,
  buildTemplateEditFrozenRules,
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
};
