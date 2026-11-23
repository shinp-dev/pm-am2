'use strict';

const studySync = (() => {
  const prefix = 'pm-a2-outbox:';
  const pending = new Map();
  const endpoint = '/api/study';
  let running = false;
  let timer;
  let etag;
  let retry = 2000;
  let onStudy;
  const status = text => {
    for (const element of document.querySelectorAll('[data-sync-status]')) {
      element.textContent = text;
    }
  };

  function readPending() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (raw) pending.set(key, JSON.parse(raw));
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  }

  function record(event) {
    const key = prefix + crypto.randomUUID();
    pending.set(key, event);
    try {
      localStorage.setItem(key, JSON.stringify(event));
    } catch {
      // The in-memory queue can still be sent while this tab is open.
    }
    status('D1 に保存中');
    schedule(350);
  }

  function preference(name, value) {
    record({ preference: { name, value, editedAt: Date.now(), changeId: crypto.randomUUID() } });
  }

  async function api(options) {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
    if (response.status === 401) throw new Error('login-required');
    if (!response.ok && response.status !== 304) throw new Error('sync');
    return response;
  }

  async function sync() {
    if (running) return;
    running = true;
    try {
      try { readPending(); } catch { /* Continue with the in-memory queue. */ }
      while (pending.size) {
        const batch = [];
        let size = 0;
        for (const entry of pending) {
          size += JSON.stringify(entry[1]).length;
          if (batch.length >= 20 || size > 240000) break;
          batch.push(entry);
        }
        await api({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attempts: batch.flatMap(([, entry]) => entry.attempt ? [entry.attempt] : []),
            preferences: batch.flatMap(([, entry]) => entry.preference ? [entry.preference] : []),
          }),
        });
        etag = undefined;
        for (const [key] of batch) {
          try { localStorage.removeItem(key); } catch { /* Idempotent on retry. */ }
          pending.delete(key);
        }
      }
      const response = await api(etag ? { headers: { 'If-None-Match': etag } } : {});
      if (response.status !== 304) {
        const remote = await response.json();
        if (!pending.size) {
          onStudy(remote);
          etag = response.headers.get('ETag');
        }
      }
      if (pending.size) schedule(0);
      else status('D1 と同期済み');
      retry = 2000;
    } catch (error) {
      status(error.message === 'login-required'
        ? '同期するには再ログインしてください'
        : pending.size ? '同期待ち · 接続回復後に再送します' : '同期待ち · 接続を再確認します');
      schedule(retry);
      retry = Math.min(retry * 2, 60000);
    } finally {
      running = false;
    }
  }

  return {
    attempt: answer => record({ attempt: answer }),
    preference,
    start(apply) {
      onStudy = apply;
      window.addEventListener('online', () => schedule(0));
      window.addEventListener('storage', event => {
        if (event.key?.startsWith(prefix) && event.newValue) schedule(350);
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) schedule(0);
      });
      setInterval(() => { if (!document.hidden) void sync(); }, 30000);
      void sync();
    },
  };
})();
