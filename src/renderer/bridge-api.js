'use strict';

function getBridge() {
  const bridge = window.productCanvas;
  if (!bridge) {
    throw new Error(
      'ProductCanvas preload bridge is not available. '
      + 'The application may be missing bundled files — reinstall or run npm start from the project root.',
    );
  }
  return bridge;
}

export const api = new Proxy({}, {
  get(_target, prop) {
    const bridge = getBridge();
    const value = bridge[prop];
    if (typeof value === 'function') {
      return (...args) => value.apply(bridge, args);
    }
    return value;
  },
});
