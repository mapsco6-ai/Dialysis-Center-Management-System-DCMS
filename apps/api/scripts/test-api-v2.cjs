const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const express = require('express');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const { apiVersioning, ROUTE_PAIRS, buildV2Document } = require('../src/common/api-v2.ts');
let server, base;
before(async () => {
  const app = express();
  app.use(apiVersioning());
  app.use(express.json());
  app.use((req, res) => {
    if (req.path.endsWith('/error')) return res.status(403).json({ message: 'Forbidden', code: 'DENIED' });
    if (req.path.endsWith('/download')) return res.type('text/csv').send('id,name\n1,Demo\n');
    if (req.path.endsWith('/empty')) return res.status(204).end();
    if (req.path.endsWith('/list')) return res.json([{ id: 'one' }]);
    if (req.path.endsWith('/paged')) return res.json({ data: [{ id: 'one' }], total: 9, page: 2, limit: 1, unread: 4 });
    if (req.path.endsWith('/cursor')) return res.json({ data: [{ id: 'one' }], nextCursor: 'abc' });
    if (req.path.endsWith('/docs-json')) return res.json({ openapi: '3.0.0' });
    res.cookie('session', 'fixture', { httpOnly: true });
    res.status(req.method === 'POST' ? 201 : 200).json({ method: req.method, path: req.path, query: req.query, body: req.body });
  });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

for (const [v2, v1] of ROUTE_PAIRS) {
  test(`HTTP compatibility: ${v2}`, async () => {
    const materialize = route => { let n = 0; return route.replace(/\{[^}]+\}/g, () => `sample-${++n}`); };
    const [method, path] = materialize(v2).split(' ');
    const [oldMethod, oldPath] = materialize(v1).split(' ');
    const request = { method, ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 7 }) } : {}) };
    const response = await fetch(`${base}/api/v2${path}?q=a%2Fb&page=2`, request);
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    assert.equal(response.headers.get('x-api-version'), '2');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    const { data } = await response.json();
    assert.equal(data.method, oldMethod);
    assert.equal(data.path, `/api/v1${oldPath}`);
    assert.deepEqual(data.query, { q: 'a/b', page: '2' });
    if (method !== 'GET') assert.deepEqual(data.body, { value: 7 });
    const old = await fetch(`${base}/api/v1${oldPath}`, { method: oldMethod });
    assert.equal(old.headers.get('deprecation'), 'true');
    assert.equal(old.headers.get('x-successor-route'), `${method} /api/v2${path}`);
    assert.equal((await old.json()).path, `/api/v1${oldPath}`);
  });
}
test('Arrays and paginated lists share data without losing metadata; v1 stays unchanged', async () => {
  const get = async path => (await fetch(base + path)).json();
  assert.deepEqual(await get('/api/v2/list'), { data: [{ id: 'one' }] });
  assert.deepEqual(await get('/api/v2/paged'), { data: [{ id: 'one' }], meta: { total: 9, page: 2, limit: 1, unread: 4 } });
  // Cursor-paginated lists (e.g. the audit feed) get the same treatment -
  // rows in data, nextCursor (not a `total`) in meta.
  assert.deepEqual(await get('/api/v2/cursor'), { data: [{ id: 'one' }], meta: { nextCursor: 'abc' } });
  assert.deepEqual(await get('/api/v1/list'), [{ id: 'one' }]);
  assert.deepEqual(await get('/api/v1/paged'), { data: [{ id: 'one' }], total: 9, page: 2, limit: 1, unread: 4 });
  assert.deepEqual(await get('/api/v1/cursor'), { data: [{ id: 'one' }], nextCursor: 'abc' });
});
test('Errors, rejected aliases, empty responses, Swagger and downloads keep their contracts', async () => {
  const error = await fetch(base + '/api/v2/error');
  assert.equal(error.status, 403);
  assert.deepEqual(await error.json(), { message: 'Forbidden', code: 'DENIED' });
  const alias = await fetch(base + '/api/v2/auth/me');
  assert.equal(alias.status, 404);
  assert.match((await alias.json()).message, /GET \/api\/v2\/me/);
  const empty = await fetch(base + '/api/v2/empty');
  assert.equal(empty.status, 204);
  assert.equal(await empty.text(), '');
  assert.equal(await (await fetch(base + '/api/v2/download')).text(), 'id,name\n1,Demo\n');
  assert.deepEqual(await (await fetch(base + '/api/v2/docs-json')).json(), { openapi: '3.0.0' });
});
test('OpenAPI describes v2 envelopes and update status without mutating v1', () => {
  const v1 = { info: {}, paths: { '/api/v1/machines/{id}/status': { post: { responses: { '201': { description: 'Saved' }, '403': { description: 'Forbidden' } } } } } };
  const snapshot = JSON.stringify(v1);
  const response = buildV2Document(v1).paths['/api/v2/machines/{id}/status'].patch.responses;
  assert.ok(response['200'].content['application/json'].schema.properties.data);
  assert.equal(response['201'], undefined);
  assert.equal(response['403'].content, undefined);
  assert.equal(JSON.stringify(v1), snapshot);
});
test('Web client unwraps resources, arrays and pagination; preserves uploads, downloads and failures', async () => {
  const { apiFetch, apiFetchBlob, ApiError, getPendingRequestCount } = require('../../web/src/lib/api.ts');
  const originalFetch = global.fetch;
  let response, request;
  global.fetch = async (url, options) => { request = { url, options }; return response; };
  try {
    for (const data of [{ id: 'patient' }, [{ id: 'patient' }], null]) {
      response = Response.json({ data });
      assert.deepEqual(await apiFetch('/patients'), data);
      assert.match(request.url, /\/api\/v2\/patients$/);
      assert.equal(request.options.credentials, 'include');
    }
    response = Response.json({ data: [], meta: { total: 10, unread: 3 } });
    assert.deepEqual(await apiFetch('/notifications'), { data: [], total: 10, unread: 3 });
    response = new Response(null, { status: 204 });
    assert.equal(await apiFetch('/auth/sessions/current', { method: 'DELETE' }), undefined);
    assert.equal(request.options.method, 'DELETE');
    response = Response.json({ data: { id: 'ticket' } });
    const form = new FormData(); form.append('description', 'fixture');
    await apiFetch('/maintenance-tickets', { method: 'POST', body: form });
    assert.equal(request.options.headers.has('Content-Type'), false);
    response = new Response('binary fixture');
    assert.equal(await (await apiFetchBlob('/maintenance-tickets/one/attachment')).text(), 'binary fixture');
    response = Response.json({ message: 'Forbidden', code: 'DENIED' }, { status: 403 });
    await assert.rejects(apiFetch('/me'), error => error instanceof ApiError && error.status === 403 && error.code === 'DENIED');
    assert.equal(getPendingRequestCount(), 0);
  } finally { global.fetch = originalFetch; }
});
