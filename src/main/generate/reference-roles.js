'use strict';

const fs = require('fs');
const path = require('path');
const { isImagePath, MAX_ANALYZE_IMAGES } = require('./image-prep');

const REFERENCE_ROLES = new Set(['detail', 'stage', 'style']);
const MAX_WERBUNG_ATTACHMENTS = MAX_ANALYZE_IMAGES;

function normalizeReferenceRole(ref) {
  const role = String(typeof ref === 'string' ? '' : ref?.role || '').trim().toLowerCase();
  return REFERENCE_ROLES.has(role) ? role : 'detail';
}

function normalizeReferenceRef(ref) {
  if (typeof ref === 'string') {
    const p = String(ref || '').trim();
    return p ? { path: p, name: path.basename(p), role: 'detail' } : null;
  }
  const filePath = String(ref?.path || '').trim();
  if (!filePath) return null;
  return {
    path: filePath,
    name: String(ref?.name || '').trim() || path.basename(filePath),
    role: normalizeReferenceRole(ref),
  };
}

function collectReferenceRefs(referenceImages) {
  return (referenceImages || [])
    .map(normalizeReferenceRef)
    .filter((ref) => ref && fs.existsSync(ref.path) && isImagePath(ref.path))
    .map((ref) => ({ ...ref, path: path.resolve(ref.path) }));
}

function collectReferencePaths(referenceImages) {
  return collectReferenceRefs(referenceImages).map((r) => r.path);
}

function resolvePrimaryDetailRef(referenceImages) {
  return collectReferenceRefs(referenceImages).find((r) => r.role === 'detail') || null;
}

function entryLabelForRole(role, isFirstDetail) {
  if (role === 'detail') return isFirstDetail ? 'product' : 'product_detail';
  if (role === 'stage') return 'stage_element';
  if (role === 'style') return 'style';
  return 'product';
}

function selectReferencesForWerbung(referenceImages, options = {}) {
  const maxSlots = Number(options.maxSlots) > 0 ? Number(options.maxSlots) : MAX_WERBUNG_ATTACHMENTS;
  const templatePath = String(options.templatePath || '').trim();
  const attachTemplate = options.attachTemplate !== false
    && templatePath
    && fs.existsSync(templatePath)
    && isImagePath(templatePath);
  const layoutPath = attachTemplate ? path.resolve(templatePath) : '';

  const productSlots = Math.max(0, maxSlots - (layoutPath ? 1 : 0));
  const refs = collectReferenceRefs(referenceImages);
  const included = [];
  const skipped = [];
  let sawDetail = false;

  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (included.length >= productSlots) {
      skipped.push({ ...ref, index, reason: 'no_slot' });
      continue;
    }
    const isFirstDetail = ref.role === 'detail' && !sawDetail;
    if (ref.role === 'detail') sawDetail = true;
    included.push({
      ...ref,
      index,
      label: entryLabelForRole(ref.role, isFirstDetail),
    });
  }

  const primaryDetail = included.find((r) => r.role === 'detail') || null;
  const attachmentPlan = [];
  let imageIndex = 1;
  for (const ref of included) {
    attachmentPlan.push({
      imageIndex,
      path: ref.path,
      role: ref.role,
      label: ref.label,
      listIndex: ref.index,
      isPrimaryDetail: Boolean(primaryDetail && ref.path === primaryDetail.path),
    });
    imageIndex += 1;
  }
  if (layoutPath) {
    attachmentPlan.push({
      imageIndex,
      path: layoutPath,
      role: 'layout',
      label: 'layout',
      listIndex: -1,
      isPrimaryDetail: false,
    });
  }

  return {
    refs: included,
    skipped,
    layoutPath,
    attachTemplate: Boolean(layoutPath),
    primaryDetailPath: primaryDetail?.path || '',
    attachmentPlan,
    productPaths: included.map((r) => r.path),
    attachmentPaths: [
      ...included.map((r) => r.path),
      ...(layoutPath ? [layoutPath] : []),
    ],
  };
}

function layoutImageIndex(attachmentPlan) {
  const plan = Array.isArray(attachmentPlan) ? attachmentPlan : [];
  const layout = plan.find((entry) => entry.role === 'layout');
  return layout?.imageIndex || 0;
}

function primaryDetailImageIndex(attachmentPlan) {
  const plan = Array.isArray(attachmentPlan) ? attachmentPlan : [];
  const primary = plan.find((entry) => entry.isPrimaryDetail);
  return primary?.imageIndex || plan.find((entry) => entry.role === 'detail')?.imageIndex || 1;
}

function buildReferenceOrderBlock(attachmentPlan) {
  const plan = Array.isArray(attachmentPlan) ? attachmentPlan : [];
  if (!plan.length) return '';

  const lines = ['ATTACHED REFERENCE IMAGES — follow this order and role for each:'];
  const primaryIdx = primaryDetailImageIndex(plan);

  for (const entry of plan) {
    const n = entry.imageIndex;
    if (entry.role === 'layout') {
      lines.push(`- Image ${n} (layout template): copy frozen header, footer, contact bar, brand text colors, icon row, neon accents, and all layout zones pixel-identically from this image. Edit only the central product stage.`);
      continue;
    }
    if (entry.role === 'detail' && entry.isPrimaryDetail) {
      lines.push(`- Image ${n} (primary product): copy exact product models, driver layout, tweeter panels, logos, finishes, and proportions.`);
      continue;
    }
    if (entry.role === 'detail') {
      lines.push(`- Image ${n} (product detail): additional product angle/detail — merge into the primary product from Image ${primaryIdx}.`);
      continue;
    }
    if (entry.role === 'stage') {
      lines.push(`- Image ${n} (stage element): place the subject from this image visibly inside the editable product stage alongside products from Image ${primaryIdx}.`);
      continue;
    }
    if (entry.role === 'style') {
      lines.push(`- Image ${n} (style reference): mood/lighting/color only — apply atmosphere to the product stage; do NOT copy subjects from this image literally into the ad.`);
    }
  }

  const layoutIdx = layoutImageIndex(plan);
  if (layoutIdx > 0 && primaryIdx > 0) {
    lines.push(`Merge products and stage elements into the layout structure of Image ${layoutIdx} photorealistically — not a flat collage.`);
  }

  return lines.join('\n');
}

function buildLayoutFrozenRules(attachmentPlan) {
  const layoutIdx = layoutImageIndex(attachmentPlan);
  if (!layoutIdx) {
    return [
      'LAYOUT FROZEN ZONES (copy pixel-identically from the attached layout template):',
      '- Top-left logo, top-right brand title, contact bar, footer category icons and labels.',
      '- Exact text colors as shown in the template (e.g. white brand title — do NOT recolor to gold).',
      '- Neon side bars and accent color exactly as in the template.',
      '- Do NOT add category highlight boxes, gold frames, or new footer emphasis.',
      '- Do NOT change fonts in header/footer/contact areas.',
    ].join('\n');
  }
  return [
    `LAYOUT FROZEN ZONES (copy pixel-identically from IMAGE ${layoutIdx} / attached template):`,
    '- Top-left logo, top-right brand title, contact bar, footer category icons and labels.',
    '- Exact text colors as shown in the template (e.g. white brand title — do NOT recolor to gold).',
    '- Neon side bars and accent color exactly as in the template.',
    '- Do NOT add category highlight boxes, gold frames, or new footer emphasis.',
    '- Do NOT change fonts in header/footer/contact areas.',
  ].join('\n');
}

function buildLayoutEditableRules(attachmentPlan) {
  const layoutIdx = layoutImageIndex(attachmentPlan);
  const primaryIdx = primaryDetailImageIndex(attachmentPlan);
  const productLine = primaryIdx > 0
    ? `- Place products from Image ${primaryIdx} and any stage-element references only inside the central stage area.`
    : '- Place products and stage elements only inside the central stage area.';
  const typographyLine = layoutIdx > 0
    ? `- Use colors and typography that match Image ${layoutIdx} for stage product lines — do not force gold on header brand text.`
    : '- Use colors and typography that match the layout template for stage product lines.';
  return [
    'EDITABLE ZONE (product stage only):',
    productLine,
    '- Ad lines (main line, line 1, line 2) may appear in the stage text zone only.',
    typographyLine,
  ].join('\n');
}

function migrateReferenceImages(referenceImages) {
  return (referenceImages || []).map((ref) => {
    const normalized = normalizeReferenceRef(ref);
    return normalized || ref;
  }).filter(Boolean);
}

module.exports = {
  REFERENCE_ROLES,
  MAX_WERBUNG_ATTACHMENTS,
  normalizeReferenceRole,
  normalizeReferenceRef,
  collectReferenceRefs,
  collectReferencePaths,
  resolvePrimaryDetailRef,
  selectReferencesForWerbung,
  entryLabelForRole,
  layoutImageIndex,
  primaryDetailImageIndex,
  buildReferenceOrderBlock,
  buildLayoutFrozenRules,
  buildLayoutEditableRules,
  migrateReferenceImages,
};
