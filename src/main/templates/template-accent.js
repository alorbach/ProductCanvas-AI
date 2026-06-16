'use strict';

const ACCENT_PRESETS = {
  blue: {
    accent: 'blue',
    accentHex: '#31b4f2',
    stageHint: 'Dark concrete showroom stage with glowing blue neon side bars and floor mist',
  },
  yellow: {
    accent: 'yellow',
    accentHex: '#FFD700',
    stageHint: 'Dark concrete showroom stage with glowing yellow neon side bars and floor mist',
  },
  green: {
    accent: 'green',
    accentHex: '#00c853',
    stageHint: 'Dark concrete showroom stage with glowing green neon side bars and floor mist',
  },
  red: {
    accent: 'red',
    accentHex: '#e53935',
    stageHint: 'Dark concrete showroom stage with glowing red neon side bars and floor mist',
  },
};

const COLOR_ALIASES = [
  { key: 'blue', patterns: ['blau', 'blue'] },
  { key: 'yellow', patterns: ['gelb', 'yellow'] },
  { key: 'green', patterns: ['grün', 'gruen', 'green'] },
  { key: 'red', patterns: ['rot', 'red'] },
];

function inferAccentKey(label) {
  const text = String(label || '').toLowerCase();
  if (!text) return '';
  for (const { key, patterns } of COLOR_ALIASES) {
    if (patterns.some((pattern) => text.includes(pattern))) {
      return key;
    }
  }
  return '';
}

function inferAccentMeta(templateOrLabel) {
  const label = typeof templateOrLabel === 'string'
    ? templateOrLabel
    : [templateOrLabel?.name, templateOrLabel?.importedFrom, templateOrLabel?.file].filter(Boolean).join(' ');
  const key = inferAccentKey(label);
  return key ? { ...ACCENT_PRESETS[key] } : null;
}

function enrichTemplateMeta(template) {
  if (!template) return template;
  const inferred = inferAccentMeta(template);
  if (!inferred) return template;
  return {
    ...template,
    accent: inferred.accent,
    accentHex: inferred.accentHex,
    stageHint: inferred.stageHint,
  };
}

module.exports = {
  ACCENT_PRESETS,
  enrichTemplateMeta,
  inferAccentKey,
  inferAccentMeta,
};
