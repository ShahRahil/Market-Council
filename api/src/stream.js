import { database } from './db.js';
export function startControlWatcher({ onKill }) {
  let closed = false;
  let lastRevision = null;
  // Polling fallback is intentional: change-stream disconnects must not undermine revocation.
  const polling = setInterval(async () => {
    try {
      const ctl = await database().collection('control').findOne({ _id:'global' });
      if (ctl && ctl.revision !== lastRevision) {
        lastRevision = ctl.revision;
        if (ctl.killSwitch) await onKill('polling');
      }
    } catch (err) { console.error('Control polling failed', err.message); }
  }, 1500);
  polling.unref?.();
  (async () => {
    while (!closed) {
      let stream;
      try {
        stream = database().collection('control').watch([], { fullDocument:'updateLookup' });
        for await (const event of stream) {
          if (closed) break;
          if (event.fullDocument?._id === 'global' && event.fullDocument.killSwitch) await onKill('change-stream');
        }
      } catch (err) {
        if (!closed) console.warn('Change stream reconnecting:', err.message);
      } finally { try { await stream?.close(); } catch {} }
      if (!closed) await new Promise(resolve => setTimeout(resolve, 2500));
    }
  })();
  return () => { closed = true; clearInterval(polling); };
}
