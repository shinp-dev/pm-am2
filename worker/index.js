const cookieName = '__Host-pm-a2-session';
const sessionAge = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const questionId = /^20(?:19|2[0-5])-(?:[1-9]|1[0-9]|2[0-5])$/;

function reply(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

async function signingKey(password) {
  return crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function login(request, password) {
  if (request.method === 'POST') {
    if (!sameOrigin(request)) return reply({ error: 'origin' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
      return reply({ error: 'content-type' }, 415);
    }
    const body = await request.text();
    const input = new URLSearchParams(body).get('password') ?? '';
    const supplied = await crypto.subtle.digest('SHA-256', encoder.encode(input));
    const expected = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    if (Array.from(new Uint8Array(supplied)).reduce((diff, byte, i) => diff | (byte ^ new Uint8Array(expected)[i]), 0) !== 0) {
      return loginPage(true);
    }
    const expiry = String(Math.floor(Date.now() / 1000) + sessionAge);
    const signature = await crypto.subtle.sign('HMAC', await signingKey(password), encoder.encode(expiry));
    const token = expiry + '.' + Array.from(new Uint8Array(signature), n => n.toString(16).padStart(2, '0')).join('');
    return new Response(null, {
      status: 303,
      headers: {
        'Location': '/',
        'Cache-Control': 'no-store',
        'Set-Cookie': `${cookieName}=${token}; Max-Age=${sessionAge}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }
  if (request.method === 'GET') return loginPage(false);
  return reply({ error: 'method' }, 405);
}

function loginPage(failed) {
  return new Response(`<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン | PM A2 演習室</title>
<style>body{margin:0;background:#faf7ef;color:#212e31;font:16px system-ui,sans-serif}main{max-width:28rem;margin:12vh auto;padding:1.5rem}form{background:#fff;border:1px solid #d5dcd8;border-top:4px solid #348679;border-radius:14px;padding:1.5rem}input,button{display:block;box-sizing:border-box;width:100%;font:inherit;padding:12px;margin-top:10px;border-radius:8px;border:1px solid #515e62}button{background:#174c49;color:#fff;cursor:pointer}</style>
<main><h1>PM A2 演習室</h1><form action="/login" method="post">
<label for="password">演習室のパスワード</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
${failed ? '<p role="alert">パスワードを確認してください。</p>' : ''}
<button type="submit">ログイン</button></form></main></html>`, {
    status: failed ? 401 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function authorized(request, password) {
  const cookie = request.headers.get('Cookie')?.split(/;\s*/).find(part => part.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  const parsed = token?.match(/^(\d{10})\.([0-9a-f]{64})$/);
  if (!parsed || Number(parsed[1]) <= Date.now() / 1000) return false;
  const signature = Uint8Array.from(parsed[2].match(/../g), hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', await signingKey(password), signature, encoder.encode(parsed[1]));
}

function sameOrigin(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}

function timestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validAnswer(answer) {
  return answer && typeof answer.id === 'string' && questionId.test(answer.id)
    && Number.isInteger(answer.choice) && answer.choice >= 0 && answer.choice <= 3
    && timestamp(answer.time) && timestamp(answer.seconds);
}

function validPreference(change) {
  if (!change || !timestamp(change.editedAt) || !/^[a-f0-9-]{36}$/.test(change.changeId)
    || typeof change.name !== 'string') return false;
  if (change.name === 'challengeBest') return Number.isInteger(change.value) && change.value >= 0 && change.value <= 5;
  const [kind, id] = change.name.split(':');
  if (!questionId.test(id) || change.name !== `${kind}:${id}`) return false;
  if (kind === 'star') return typeof change.value === 'boolean';
  return kind === 'note' && typeof change.value === 'string' && change.value.length <= 10000;
}

async function readStudy(request, db) {
  const cached = request.headers.get('If-None-Match');
  if (cached) {
    const revision = await db.prepare('SELECT revision FROM pm_a2_revision WHERE id = 1').first('revision');
    if (cached === `"study-${revision}"`) {
      return new Response(null, { status: 304, headers: { 'Cache-Control': 'no-store', 'ETag': cached } });
    }
  }
  const [revision, answers, preferences] = await db.batch([
    db.prepare('SELECT revision FROM pm_a2_revision WHERE id = 1'),
    db.prepare('SELECT question AS id, choice, time, seconds FROM pm_a2_answers ORDER BY time, question, choice, seconds'),
    db.prepare('SELECT name, value FROM pm_a2_preferences'),
  ]);
  return reply({
    attempts: answers.results,
    preferences: Object.fromEntries(preferences.results.map(row => [row.name, JSON.parse(row.value)])),
  }, 200, { ETag: `"study-${revision.results[0].revision}"` });
}

async function writeStudy(request, db) {
  if (!sameOrigin(request)) return reply({ error: 'origin' }, 403);
  if (request.headers.get('Content-Type') !== 'application/json') return reply({ error: 'content-type' }, 415);
  const body = await request.text();
  if (body.length > 275000) return reply({ error: 'too-large' }, 413);
  let patch;
  try {
    patch = JSON.parse(body);
  } catch {
    return reply({ error: 'json' }, 400);
  }
  const { attempts, preferences } = patch ?? {};
  if (!Array.isArray(attempts) || !Array.isArray(preferences) || attempts.length + preferences.length > 25
    || !attempts.every(validAnswer) || !preferences.every(validPreference)) {
    return reply({ error: 'invalid-study-data' }, 400);
  }
  const statements = attempts.map(a => db.prepare(
    'INSERT INTO pm_a2_answers (question, choice, time, seconds) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'
  ).bind(a.id, a.choice, a.time, a.seconds));
  for (const change of preferences) {
    const keepHigher = change.name === 'challengeBest';
    const condition = keepHigher
      ? 'CAST(excluded.value AS INTEGER) > CAST(pm_a2_preferences.value AS INTEGER)'
      : '(excluded.edited_at, excluded.change_id) > (pm_a2_preferences.edited_at, pm_a2_preferences.change_id)';
    statements.push(db.prepare(`
      INSERT INTO pm_a2_preferences (name, value, edited_at, change_id) VALUES (?, ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET value = excluded.value, edited_at = excluded.edited_at, change_id = excluded.change_id
      WHERE ${condition}
    `).bind(change.name, JSON.stringify(change.value), change.editedAt, change.changeId));
  }
  if (statements.length) {
    statements.push(db.prepare('UPDATE pm_a2_revision SET revision = revision + 1 WHERE id = 1'));
    await db.batch(statements);
  }
  return reply({ saved: true });
}

export default {
  async fetch(request, env) {
    const password = env.STUDY_PASSWORD;
    if (typeof password !== 'string' || !password) return reply({ error: 'STUDY_PASSWORD is missing' }, 503);
    const path = new URL(request.url).pathname;
    if (path === '/login') return login(request, password);
    const api = path.startsWith('/api/');
    if (!await authorized(request, password)) {
      if (api) return reply({ error: 'login-required' }, 401);
      return new Response(null, { status: 302, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
    }
    if (!api) return env.ASSETS.fetch(request);
    if (path !== '/api/study') return reply({ error: 'not-found' }, 404);
    try {
      if (request.method === 'GET') return await readStudy(request, env.DB);
      if (request.method === 'POST') return await writeStudy(request, env.DB);
      return reply({ error: 'method' }, 405, { Allow: 'GET, POST' });
    } catch {
      return reply({ error: 'd1-unavailable' }, 503);
    }
  },
};
