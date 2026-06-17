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

// Return preload exports as-is — re-wrapping contextBridge functions can break IPC calls.
export const api = new Proxy({}, {
  get(_target, prop) {
    return getBridge()[prop];
  },
});
