'use strict';

import { t } from './i18n/i18n.js';

import { api } from './bridge-api.js';

export function menuItem(id, labelKey, options = {}) {
  if (options.separator) {
    return { separator: true };
  }
  return {
    id,
    label: t(labelKey),
    enabled: options.enabled !== false,
  };
}

export async function showContextMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  const filtered = (items || []).filter(Boolean);
  if (!filtered.length) return null;
  return api.showContextMenu({
    x: event.clientX,
    y: event.clientY,
    items: filtered,
  });
}
