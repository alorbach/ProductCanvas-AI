'use strict';

function subscribeBridgeJobProgress(client, onProgress) {
  if (!onProgress || !client?.subscribeJobEvents) {
    return () => {};
  }
  return client.subscribeJobEvents((jobs) => {
    if (jobs.error) return;
    const active = jobs.active?.[0];
    onProgress({
      running_count: jobs.running_count,
      queued_count: jobs.queued_count,
      status: active?.status || 'running',
      message: active?.message,
      elapsed_ms: active?.elapsed_ms || 0,
      session_output: active?.session_output || '',
      type: active?.type,
    });
  });
}

module.exports = { subscribeBridgeJobProgress };
