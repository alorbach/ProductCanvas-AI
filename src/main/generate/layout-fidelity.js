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
  '- Ad lines (main line, line 1, line 2) may appear in the stage text zone only.',
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
  if (!options.allowGoldHeader && /\bgold\b.*\b(brand|header)\b/i.test(text)) {
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

function buildTemplateEditFrozenRules(changeRequest, imageSettings = {}, options = {}) {
  const sizeLine = imageSettings.size
    ? `Target output size: ${imageSettings.size} (exact layout template dimensions). Do not change aspect ratio or canvas size.`
    : 'Keep exact template canvas dimensions.';
  const lines = [
    'Edit the attached layout template image.',
    sizeLine,
    LAYOUT_FROZEN_RULES,
    'Only apply the user change inside allowed zones unless the user explicitly names a frozen element.',
    `User change request: ${changeRequest}`,
  ];
  if (options.hasStyleReference) {
    lines.push(
      'TWO ATTACHED IMAGES:',
      '- IMAGE 1 = layout template to edit (authoritative for header, footer, contact bar, branding, neon accents).',
      '- IMAGE 2 = style/visual reference only — use for background, texture, lighting mood, or colors as described in the user request.',
      '- Do NOT copy header, footer, logos, or contact bar from IMAGE 2.',
      '- Do NOT replace the template with IMAGE 2; merge the requested visual style into IMAGE 1 editable zones.',
      'The optimizedEditPrompt must link the user request to IMAGE 2 (e.g. product-stage background like IMAGE 2).',
    );
  }
  lines.push('Return ONLY JSON: {"optimizedEditPrompt":"english image edit prompt","changeSummary":"short german summary","preservedElements":["..."]}');
  return lines.join('\n\n');
}

function buildPreviewEditFrozenRules(changeRequest, imageSettings = {}, options = {}) {
  const sizeLine = imageSettings.size
    ? `Target output size: ${imageSettings.size}. Do not change aspect ratio or canvas size.`
    : 'Keep exact canvas dimensions of the attached preview.';
  const template = options.template;
  const hasLayoutReference = Boolean(options.hasLayoutReference && template);
  const lines = [
    'Edit the attached advertisement preview image.',
    sizeLine,
  ];
  if (hasLayoutReference) {
    lines.push(
      'TWO ATTACHED IMAGES:',
      '- IMAGE 1 = advertisement preview to edit (apply the user change here).',
      '- IMAGE 2 = layout template (authoritative for frozen header, footer, contact bar, branding, neon accents).',
      LAYOUT_FROZEN_RULES,
      LAYOUT_EDITABLE_RULES,
      'Only change header, footer, contact bar, branding, or neon accents if the user explicitly requests it in the change request.',
      buildProductStageHint(template),
    );
  } else {
    lines.push(
      'ONE ATTACHED IMAGE:',
      '- The preview image is the only reference — apply the user change to this image.',
      'Preserve header, footer, contact bar, branding, neon accents, and typography unless the user explicitly requests a change.',
    );
  }
  lines.push(
    'Apply the user change precisely; do not redesign the ad or invent a new layout.',
    `User change request: ${changeRequest}`,
    'Return ONLY JSON: {"optimizedEditPrompt":"english image edit prompt","changeSummary":"short german summary","preservedElements":["..."]}',
  );
  return lines.join('\n\n');
}

function appendPreviewEditLockBlock(prompt, imageSettings = {}, template = null) {
  if (template) {
    return appendLayoutLockBlock(prompt, template, imageSettings);
  }
  const parts = [String(prompt || '').trim()];
  parts.push([
    'PREVIEW EDIT RULES:',
    '- Edit only the attached preview image.',
    '- Keep canvas size and aspect ratio exactly as in the preview.',
    '- Preserve existing header, footer, contact bar, branding, and neon accents unless the user explicitly requests a change.',
    '- Apply the user change request precisely; do not redesign the advertisement.',
  ].join('\n'));
  const size = String(imageSettings.size || '').trim();
  if (size) {
    parts.push(`MANDATORY output size: ${size}. Do not use any other resolution.`);
  }
  return parts.filter(Boolean).join('\n\n');
}

const EFFECT_EDIT_RULES = [
  'EFFECT IMAGE RULES:',
  '- Edit only background, atmosphere, texture, lighting, color, and intensity.',
  '- No products, no text, no logos, no UI chrome, no watermarks.',
  '- Preserve seamless/tileable background character unless the user explicitly requests otherwise.',
].join('\n');

function buildEffectEditRules(changeRequest, imageSettings = {}, options = {}) {
  const sizeLine = imageSettings.size
    ? `Target output size: ${imageSettings.size}. Do not change aspect ratio or canvas size.`
    : 'Keep exact effect image canvas dimensions.';
  const lines = [
    'Edit the attached effect/background image.',
    sizeLine,
    EFFECT_EDIT_RULES,
    `User change request: ${changeRequest}`,
  ];
  if (options.hasStyleReference) {
    lines.push(
      'TWO ATTACHED IMAGES:',
      '- IMAGE 1 = effect/background image to edit (authoritative base).',
      '- IMAGE 2 = style/visual reference only — use for mood, texture, lighting, or colors as described in the user request.',
      '- Do NOT replace IMAGE 1 with IMAGE 2; merge the requested visual style into IMAGE 1.',
      'The optimizedEditPrompt must link the user request to IMAGE 2 when relevant.',
    );
  }
  lines.push('Return ONLY JSON: {"optimizedEditPrompt":"english image edit prompt","changeSummary":"short german summary","preservedElements":["..."]}');
  return lines.join('\n\n');
}

function appendEffectEditLockBlock(prompt, imageSettings = {}) {
  const parts = [String(prompt || '').trim(), EFFECT_EDIT_RULES];
  const size = String(imageSettings.size || '').trim();
  if (size) {
    parts.push(`MANDATORY output size: ${size}. Do not use any other resolution.`);
  }
  parts.push('Apply only the explicit user edit request. Do not add products or text.');
  return parts.filter(Boolean).join('\n\n');
}

function buildEffectResizeOnlyPrompt(imageSettings, sourceDims = {}) {
  const fromSize = sourceDims.width && sourceDims.height
    ? `${sourceDims.width}x${sourceDims.height}`
    : 'source effect';
  const toSize = imageSettings.size === 'auto'
    ? 'auto (best fit)'
    : imageSettings.size;
  const base = [
    `Resize the attached effect/background image from ${fromSize} to output size ${toSize}.`,
    'Preserve atmosphere, texture, and seamless background character.',
    'Scale proportionally — do not redesign or add content.',
    'No content changes — format / canvas size only.',
  ].join(' ');
  return appendEffectEditLockBlock(base, imageSettings);
}

function buildResizeOnlyPrompt(template, imageSettings, sourceDims = {}) {
  const fromSize = sourceDims.width && sourceDims.height
    ? `${sourceDims.width}x${sourceDims.height}`
    : 'source template';
  const toSize = imageSettings.size === 'auto'
    ? 'auto (best fit for layout)'
    : imageSettings.size;
  const base = [
    `Resize the attached layout template from ${fromSize} to output size ${toSize}.`,
    'Preserve header, footer, contact bar, neon accents, icons, typography colors, and product stage layout.',
    'Scale the full design proportionally — do not redesign, recolor, or omit layout elements.',
    'No content changes — format / canvas size only.',
  ].join(' ');
  return appendLayoutLockBlock(base, template, imageSettings);
}

module.exports = {
  LAYOUT_EDITABLE_RULES,
  LAYOUT_FROZEN_RULES,
  EFFECT_EDIT_RULES,
  appendEffectEditLockBlock,
  appendLayoutLockBlock,
  appendPreviewEditLockBlock,
  buildEffectEditRules,
  buildEffectResizeOnlyPrompt,
  buildProductStageHint,
  buildPreviewEditFrozenRules,
  buildResizeOnlyPrompt,
  buildTemplateEditFrozenRules,
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
};
