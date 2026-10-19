// Run with Node 24+: node tests/delete_account.test.mjs
import assert from 'node:assert/strict';
import { createDeleteAccountHandler } from '../supabase/functions/delete-account/index.ts';
const origin = 'https://xuxing-ppp.github.io';
const body = { confirmation: '注销', expectedUserId: 'user-a' };
let calls = [];
let identityStatus = 200, deleteStatus = 200, networkError = false;
const handler = createDeleteAccountHandler({ url: 'https://example.supabase.co', adminKey: 'server-only-key', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (networkError) throw new Error('network server-only-key');
    const status = url.endsWith('/user') ? identityStatus : deleteStatus;
    return Response.json(url.endsWith('/user') ? { id: 'user-a' } : {}, { status });
} });
function request({ method = 'POST', token = 'user-token', value = body, from = origin } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (from) headers.Origin = from;
    if (token) headers.Authorization = `Bearer ${token}`;
    return new Request('https://example.supabase.co/functions/v1/delete-account', {
        method, headers, ...(method === 'POST' ? { body: JSON.stringify(value) } : {})
    });
}
let count = 0;
async function test(name, fn) {
    calls = []; identityStatus = 200; deleteStatus = 200; networkError = false;
    await fn(); count++; console.log('PASS', name);
}
await test('CORS preflight allows only configured origins without touching authentication', async () => {
    const response = await handler(request({ method: 'OPTIONS' }));
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(calls.length, 0);
    const blocked = await handler(request({ from: 'https://malicious.example' }));
    assert.equal(blocked.status, 403); assert.equal(calls.length, 0);
});
await test('GET, missing token, invalid confirmation, and oversized input never call admin deletion', async () => {
    assert.equal((await handler(request({ method: 'GET' }))).status, 405);
    assert.equal((await handler(request({ token: null }))).status, 401);
    assert.equal((await handler(request({ value: { expectedUserId: 'user-a' } }))).status, 400);
    assert.equal((await handler(request({ value: { ...body, extra: 'x'.repeat(1025) } }))).status, 400);
    assert.equal(calls.length, 0);
});
await test('invalid or expired token is verified with Auth and cannot reach admin deletion', async () => {
    identityStatus = 401;
    assert.equal((await handler(request())).status, 401);
    assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/auth/v1/user'));
    assert.equal(calls[0].options.headers.Authorization, 'Bearer user-token');
});
await test('caller-supplied ID cannot delete a different account', async () => {
    assert.equal((await handler(request({ value: { ...body, expectedUserId: 'victim' } }))).status, 409);
    assert.equal(calls.length, 1);
});
await test('only verified caller is hard-deleted with server credentials', async () => {
    const response = await handler(request());
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true, userId: 'user-a' });
    assert.equal(calls.length, 2); assert.ok(calls[1].url.endsWith('/auth/v1/admin/users/user-a'));
    assert.equal(calls[1].options.method, 'DELETE');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer server-only-key');
    assert.deepEqual(JSON.parse(calls[1].options.body), { should_soft_delete: false });
});
await test('failed identity service and failed admin deletion never report success', async () => {
    identityStatus = 503; assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 1);
    identityStatus = 200; deleteStatus = 500;
    const response = await handler(request()); assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /server-only-key/);
});
await test('network exceptions remain unconfirmed and never reveal credentials', async () => {
    networkError = true; const response = await handler(request()); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /server-only-key/);
});
await test('unconfigured server refuses deletion', async () => {
    const missing = createDeleteAccountHandler({ url: '', adminKey: '' });
    assert.equal((await missing(request())).status, 503);
});
console.log(`${count} account deletion endpoint checks passed`);
