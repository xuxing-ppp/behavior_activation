// Run with: node tests/sync.test.js
// Real application storage/merge/controller; in-memory Supabase transport supports races and outages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const KEY = 'weiguang-ba-v1';
const empty = () => ({ activities: [], moods: {}, version: 1 });
const activity = (id, title = id) => ({ id, title, date: '2026-10-19', time: '', minutes: 5, category: 'care', step: '', why: '', status: '', created: 1, note: '', skipReason: '' });
const records = (...items) => ({ ...empty(), activities: items });
const plain = x => JSON.parse(JSON.stringify(x));
function server() { return { row: null, writes: 0, fail: false, gate: null, race: false }; }
async function device(remote, seed = empty(), user = 'user-a', saved) {
    const disk = saved || new Map([[KEY, JSON.stringify(seed)]]);
    let failWrites = false, authCallback, editing = false;
    const nodes = new Map();
    const node = selector => {
        if (!nodes.has(selector)) nodes.set(selector, { textContent: '', outerHTML: '', value: '', style: {} });
        return nodes.get(selector);
    };
    const document = {
        activeElement: { matches: () => editing },
        querySelector: s => ['#modalLayer', '#moodNote'].includes(s) ? null : node(s),
        addEventListener() {},
    };
    const api = {
        auth: {
            onAuthStateChange(fn) { authCallback = fn; },
            async getSession() { return { data: { session: user ? { user: { id: user, user_metadata: { user_name: user } } } : null } }; },
            async signOut() { authCallback('SIGNED_OUT', null); return {}; },
            async signInWithOAuth(options) { api.lastLogin = options; return {}; }
        },
        from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() {
            if (remote.gate) await remote.gate;
            if (remote.fail) throw new Error('offline');
            return { data: remote.row ? structuredClone(remote.row) : null };
        } }; },
        async rpc(_, args) {
            if (remote.fail) throw new Error('offline');
            if (remote.rpcGate) await remote.rpcGate;
            if (remote.race) { remote.race = false; return { data: false }; }
            if (args.expected_revision !== (remote.row?.revision || 0)) return { data: false };
            remote.row = { payload: plain(args.new_payload), revision: (remote.row?.revision || 0) + 1 };
            remote.writes++;
            return { data: true };
        }
    };
    const window = { location: { protocol: 'https:', origin: 'https://example.com', pathname: '/' }, navigator: { onLine: true }, supabase: { createClient: () => api }, addEventListener() {} };
    const context = vm.createContext({ window, document, console, structuredClone, setTimeout: () => 1, clearTimeout() {}, confirm: () => true,
        localStorage: { getItem: k => disk.get(k) ?? null, setItem(k, v) { if (failWrites) throw new Error('quota'); disk.set(k, v); } }
    });
    for (const name of ['config', 'utils', 'storage', 'backup', 'sync']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', name + '.js'), 'utf8'), context, { filename: name });
    }
    const app = window.Weiguang;
    app.components.toast = () => {};
    app.pages.renderPreservingPosition = () => {};
    app.state.data = app.storage.load();
    await app.sync.start();
    return { app, disk, node, api, run: () => app.sync.action('syncNow'), enable: () => app.sync.action('syncEnable'), edit: change => app.storage.commit(change), fail: value => { failWrites = value; }, editing: value => { editing = value; } };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS', name); }
(async () => {
    await test('GitHub and Google select their own OAuth provider without uploading records', async () => {
        const remote = server(), d = await device(remote, records(activity('a')), null);
        assert.match(d.app.sync.panel(), /使用 GitHub 登录/);
        assert.match(d.app.sync.panel(), /使用 Google 登录/);
        await d.app.sync.action('syncLogin', 'github');
        assert.equal(d.api.lastLogin.provider, 'github');
        await d.app.sync.action('syncLogin', 'google');
        assert.equal(d.api.lastLogin.provider, 'google');
        assert.equal(d.api.lastLogin.options.redirectTo, d.app.sync.settings.redirect);
        await d.app.sync.action('syncLogin', 'unknown');
        assert.equal(d.api.lastLogin.provider, 'google');
        assert.equal(remote.writes, 0);
        assert.equal(d.app.state.data.activities.length, 1);
    });
    await test('first enable backs up before associating; login alone never uploads', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.run(); assert.equal(remote.writes, 0);
        await d.enable(); await d.run();
        assert.equal(remote.row.payload.activities[0].id, 'a');
        assert.equal(JSON.parse(d.disk.get(KEY + '-before-sync')).data.activities[0].id, 'a');
    });
    await test('two devices merge independent offline additions without loss', async () => {
        const remote = server(), a = await device(remote, records(activity('a')));
        await a.enable(); await a.run();
        const b = await device(remote); await b.enable(); await b.run();
        remote.fail = true;
        a.edit(d => d.activities.push(activity('b')));
        b.edit(d => d.activities.push(activity('c')));
        await a.run(); await b.run();
        assert.equal(a.app.state.data.activities.length, 2);
        assert.equal(b.app.state.data.activities.length, 2);
        remote.fail = false; await a.run(); await b.run(); await a.run();
        assert.deepEqual(remote.row.payload.activities.map(x => x.id).sort(), ['a', 'b', 'c']);
        assert.equal(a.app.state.data.activities.length, 3);
    });
    await test('deletions propagate and old offline devices do not resurrect them', async () => {
        const remote = server(), a = await device(remote, records(activity('a'), activity('b')));
        await a.enable(); await a.run(); const b = await device(remote); await b.enable(); await b.run();
        a.edit(d => d.activities = d.activities.filter(x => x.id !== 'a')); await a.run();
        b.edit(d => d.activities.find(x => x.id === 'b').title = 'changed elsewhere'); await b.run();
        assert.deepEqual(remote.row.payload.activities.map(x => x.id), ['b']);
        assert.equal(remote.row.payload.activities[0].title, 'changed elsewhere');
    });
    await test('same activity edits stop sync until explicit choice and preserve a backup', async () => {
        const remote = server(), a = await device(remote, records(activity('a')));
        await a.enable(); await a.run(); const b = await device(remote); await b.enable(); await b.run();
        a.edit(d => d.activities[0].title = 'cloud edit'); await a.run();
        b.edit(d => d.activities[0].title = 'local edit'); await b.run();
        assert.match(b.app.sync.panel(), /有记录需要选择|冲突记录保留/);
        assert.equal(b.app.state.data.activities[0].title, 'local edit');
        assert.equal(remote.row.payload.activities[0].title, 'cloud edit');
        await b.app.sync.action('syncCloud');
        assert.equal(b.app.state.data.activities[0].title, 'cloud edit');
        assert.equal(JSON.parse(b.disk.get(KEY + '-before-cloud-merge')).data.activities[0].title, 'local edit');
    });
    await test('local conflict choice preserves other remote additions', async () => {
        const remote = server(), a = await device(remote, records(activity('a')));
        await a.enable(); await a.run(); const b = await device(remote); await b.enable(); await b.run();
        a.edit(d => { d.activities[0].title = 'remote'; d.activities.push(activity('remote-only')); }); await a.run();
        b.edit(d => d.activities[0].title = 'local'); await b.run(); await b.app.sync.action('syncLocal');
        assert.deepEqual(remote.row.payload.activities.map(x => x.title).sort(), ['local', 'remote-only']);
    });
    await test('old sparse records and cleared feedback do not create false conflicts', async () => {
        const remote = server(); const old = { id: 'a', title: 'old', date: '2026-10-19', minutes: 5, category: 'care', status: '', created: 1 };
        const d = await device(remote, records(old)); await d.enable(); await d.run();
        d.edit(x => { x.activities[0].status = 'done'; delete x.activities[0].note; delete x.activities[0].skipReason; });
        await d.run();
        assert.equal(remote.row.payload.activities[0].status, 'done');
        assert.doesNotMatch(d.app.sync.panel(), /冲突记录保留/);
        const writes = remote.writes; await d.run(); assert.equal(remote.writes, writes);
    });
    await test('same-day mood conflicts and edit-versus-delete conflicts are detected', async () => {
        const d = await device(server());
        const base = { ...empty(), moods: { '2026-10-19': { mood: 5, note: '' } } };
        const l = structuredClone(base), r = structuredClone(base);
        l.moods['2026-10-19'].mood = 2; r.moods['2026-10-19'].mood = 8;
        assert.equal(d.app.sync.merge(base, l, r).conflicts.length, 1);
        assert.equal(d.app.sync.merge(records(activity('a')), empty(), records(activity('a', 'edited'))).conflicts.length, 1);
    });
    await test('server revision race never falsely marks unsent changes synced', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); remote.race = true; await d.run();
        assert.equal(remote.writes, 0); assert.equal(d.app.state.data._sync.base.activities.length, 0);
        await d.run(); assert.equal(remote.writes, 1);
    });
    await test('local write failures preserve data and prevent upload', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run(); d.fail(true);
        assert.equal(d.edit(x => x.activities[0].title = 'unsaved'), false);
        assert.equal(d.app.state.data.activities[0].title, 'a'); await d.run();
        assert.equal(remote.row.payload.activities[0].title, 'a');
    });
    await test('failed pre-merge backup stops remote data from replacing local', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run(); remote.row.payload.activities.push(activity('b')); remote.row.revision++;
        d.fail(true); await d.run(); assert.equal(d.app.state.data.activities.length, 1);
    });
    await test('logout keeps records; another account cannot upload them', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run(); await d.app.sync.action('syncLogout');
        assert.equal(d.app.state.data.activities.length, 1);
        const other = await device(remote, empty(), 'user-b', d.disk); const writes = remote.writes;
        await other.enable(); await other.run(); assert.equal(remote.writes, writes);
        assert.equal(other.app.state.data._sync.owner, 'user-a');
    });
    await test('local clear disables sync without deleting cloud records', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run(); d.app.storage.save(empty(), { localClear: true }); await d.run();
        assert.equal(remote.row.payload.activities.length, 1); assert.equal(d.app.state.data.activities.length, 0);
        await d.enable(); await d.run(); assert.equal(d.app.state.data.activities.length, 1);
    });
    await test('pending changes survive page reload while offline', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run(); remote.fail = true; d.edit(x => x.activities.push(activity('b'))); await d.run();
        const reloaded = await device(remote, empty(), 'user-a', d.disk); remote.fail = false; await reloaded.run();
        assert.equal(remote.row.payload.activities.length, 2);
    });
    await test('edits during a pending request are never overwritten', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run();
        let release; remote.rpcGate = new Promise(resolve => { release = resolve; });
        d.edit(x => x.activities[0].title = 'first'); const inFlight = d.run();
        await new Promise(resolve => setImmediate(resolve));
        d.edit(x => x.activities[0].title = 'latest'); release(); await inFlight; remote.rpcGate = null;
        assert.equal(d.app.state.data.activities[0].title, 'latest');
        await d.run();
        // A conflict can require explicit choice; local latest must never be silently lost.
        assert.equal(d.app.state.data.activities[0].title, 'latest');
    });
    await test('another tab cannot overwrite newer local storage', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        const latest = records(activity('new-tab')); d.disk.set(KEY, JSON.stringify(latest));
        assert.equal(d.edit(x => x.activities.push(activity('stale-tab'))), false);
        assert.equal(JSON.parse(d.disk.get(KEY)).activities[0].id, 'new-tab');
    });
    await test('open editors defer remote application and malformed remote stops sync', async () => {
        const remote = server(), d = await device(remote, records(activity('a')));
        await d.enable(); await d.run(); remote.row.payload.activities.push(activity('b')); remote.row.revision++;
        d.editing(true); await d.run(); assert.equal(d.app.state.data.activities.length, 1);
        d.editing(false); await d.run(); assert.equal(d.app.state.data.activities.length, 2);
        remote.row.payload = { version: 1, activities: [null], moods: {} }; await d.run();
        assert.equal(d.app.state.data.activities.length, 2); assert.match(d.app.sync.panel(), /格式异常/);
    });
    console.log(`${count} sync checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
