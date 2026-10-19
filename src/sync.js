// 可选云同步：本地优先、三方合并、数据库版本校验；网络失败不阻断本地记录。
(function (App) {
    'use strict';
    const { config, state, storage, utils, backup } = App;
    const settings = Object.freeze({
        url: 'https://ppokmgorqdqzcskkoqnd.supabase.co',
        key: 'sb_publishable_-LjWRZDDi2MBNzSm6qkcUA_nzbw5L7f',
        redirect: 'https://xuxing-ppp.github.io/behavior_activation/'
    });
    const empty = () => ({ activities: [], moods: {}, version: 1 });
    const records = data => {
        const clean = backup.cleanData(data);
        if (clean.activities.length !== data.activities.length ||
            new Set(clean.activities.map(a => a.id)).size !== clean.activities.length)
            throw new Error('invalid-local');
        return structuredClone(clean);
    };
    // 忽略对象属性顺序及 undefined，与 JSON 存储保持一致。
    function stable(value) {
        return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
    }
    const equal = (a, b) => stable(a) === stable(b);
    let client, session = null, loading, timer, busy = false, generation = 0;
    let message = '未开启云同步，记录保存在本地', conflict = null, resolution = null;
    let lastSynced = '', externalChange = false, deleting = false, deleteTarget = null;
    const firstBackup = config.KEY + '-before-sync';
    const recentBackup = config.KEY + '-before-cloud-merge';

    // 以每条活动和每日心情为合并单位。缺失的条目表达删除，无需依赖设备时钟。
    function merge(base, local, remote, prefer) {
        const conflicts = [];
        function group(kind, b, l, r) {
            const result = Object.create(null);
            for (const id of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
                let value;
                if (equal(l[id], r[id]) || equal(r[id], b[id])) value = l[id];
                else if (equal(l[id], b[id])) value = r[id];
                else {
                    conflicts.push({ kind, id, local: l[id], remote: r[id] });
                    value = prefer === 'cloud' ? r[id] : l[id];
                }
                if (value !== undefined) result[id] = structuredClone(value);
            }
            return result;
        }
        const byId = data => Object.fromEntries(data.activities.map(a => [a.id, a]));
        const activities = Object.values(group('activity', byId(base), byId(local), byId(remote)));
        const moods = group('mood', base.moods, local.moods, remote.moods);
        return { data: { activities, moods, version: 1 }, conflicts };
    }

    function panel() {
        const owner = state.data?._sync?.owner;
        const mismatch = session && owner && owner !== session.user.id;
        const enabled = session && owner === session.user.id && state.data?._sync?.enabled;
        const identities = [...new Set((session?.user.identities || []).map(identity => ({ github: 'GitHub', google: 'Google' })[identity.provider]).filter(Boolean))];
        const account = session ? utils.e(session.user.user_metadata?.user_name || session.user.email || session.user.user_metadata?.full_name || '已登录用户') : '';
        return `<section id="syncPanel" class="sync-panel" aria-labelledby="syncTitle"><div class="settings-row"><div><strong id="syncTitle">跨设备同步</strong><p>使用同一个账号，通过 GitHub 或 Google 登录，在手机与电脑间同步。可随时关闭自动同步或退出登录，记录继续保存在本地。</p></div></div><p class="sync-status small" role="status" aria-live="polite">${utils.e(message)}${lastSynced && enabled ? ' · 最近同步 ' + utils.e(lastSynced) : ''}</p>${session ? `<p class="small muted">已登录：${account}${identities.length ? ' · 登录方式：' + identities.join('、') : ''}</p>` : ''}<div class="sync-actions">${!session ? '<button class="btn btn-outline" data-action="syncLogin" data-provider="github">使用 GitHub 登录</button><button class="btn btn-outline" data-action="syncLogin" data-provider="google">使用 Google 登录</button>' : `${!enabled && !mismatch && !state.data?._sync?.deletionPending ? '<button class="btn btn-primary" data-action="syncEnable">开启自动同步</button>' : ''}${enabled ? `<button class="btn btn-outline" data-action="syncNow" ${busy ? 'disabled' : ''}>立即同步</button><button class="btn btn-text" data-action="syncDisable">关闭自动同步</button>` : ''}${mismatch ? '<button class="btn btn-outline" data-action="syncRelink">重新关联当前账号</button>' : ''}<button class="btn btn-text" data-action="syncLogout">退出登录</button><button class="btn btn-text account-delete" data-action="syncDelete" ${deleting ? 'disabled' : ''}>注销账号</button>`}${conflict ? '<button class="btn btn-outline" data-action="syncLocal">冲突记录保留本地版本</button><button class="btn btn-outline" data-action="syncCloud">冲突记录保留云端版本</button>' : ''}</div>${conflict ? `<div class="sync-conflicts small"><p>以下记录在两台设备都发生了修改；其他记录仍会合并。请选择这些冲突记录要保留的版本。</p>${conflict.items.map(item => `<p>${utils.e(item.kind === 'mood' ? item.id + ' 的心情' : item.local?.title || item.remote?.title || '已删除的活动')}：本地${item.local ? '已修改' : '已删除'}，云端${item.remote ? '已修改' : '已删除'}</p>`).join('')}</div>` : ''}${state.data?._sync?.deletionPending ? '<p class="small muted">注销请求尚未确认，已暂停同步。可重试注销；解除本地关联仅保留本地记录，不代表云端已删除。</p><button class="btn btn-outline" data-action="syncDetach">保留记录并解除本地关联</button>' : ''}<div class="sync-actions"><button class="btn btn-text" data-action="syncInitialBackup">导出首次同步前备份</button><button class="btn btn-text" data-action="syncBackup">导出最近合并前备份</button></div><p class="small muted">同步在页面打开时运行；断网或云端暂停时，修改先保存在本地。关闭页面后无法保证后台同步。</p></section>`;
    }

    function paint() {
        const node = utils.$('#syncPanel');
        if (node) node.outerHTML = panel();
        const chip = utils.$('#syncChip');
        if (chip) chip.textContent = conflict ? '同步需处理' : message;
    }
    function status(value) { message = value; paint(); }
    function editing() {
        return !!utils.$('#modalLayer') || !!document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
    }
    function schedule(delay = 1500) {
        clearTimeout(timer);
        if (deleting || typeof window.location === 'undefined' || !session || !state.data?._sync?.enabled ||
            state.data._sync.owner !== session.user.id || externalChange) return;
        timer = setTimeout(() => void run(), delay);
    }
    function changed() {
        generation++;
        conflict = null;
        resolution = null;
        if (session && state.data?._sync?.enabled && state.data._sync.owner === session.user.id)
            status('已保存到本地，等待同步');
        schedule();
    }
    function preserve(key, data) {
        localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), data: records(data) }));
    }
    function validateCloud(payload) {
        const clean = backup.cleanData(payload);
        if (payload.version !== 1 || clean.activities.length !== payload.activities.length ||
            Object.keys(clean.moods).length !== Object.keys(payload.moods).length ||
            new Set(clean.activities.map(a => a.id)).size !== clean.activities.length)
            throw new Error('invalid-cloud');
        return clean;
    }
    function currentDisk() {
        const disk = localStorage.getItem(config.KEY);
        return !disk || equal(JSON.parse(disk), state.data);
    }

    async function run() {
        const meta = state.data?._sync;
        if (deleting || !client || !session || !meta?.enabled || meta.owner !== session.user.id || externalChange) return;
        if (busy) { schedule(2000); return; }
        if (editing()) { schedule(3000); return; }
        if (window.navigator?.onLine === false) { status('离线中，修改已保存在本地'); schedule(30000); return; }
        busy = true;
        const ticket = generation, user = session.user.id;
        let nextDelay = 30000;
        status('正在同步…');
        try {
            if (!currentDisk()) throw new Error('another-tab');
            const { data: row, error } = await client.from('weiguang_sync').select('payload,revision').eq('user_id', user).maybeSingle();
            if (error) throw error;
            if (ticket !== generation) return;
            if (editing()) { nextDelay = 3000; return; }
            if (!currentDisk()) throw new Error('another-tab');
            const remote = row ? validateCloud(row.payload) : empty();
            const base = meta.base || empty();
            const local = records(state.data);
            // 只有与用户刚才查看的冲突快照一致时，才应用其版本选择。
            const choice = resolution && equal(resolution.local, local) && equal(resolution.remote, remote) ? resolution.prefer : null;
            const merged = merge(base, local, remote, choice);
            if (merged.conflicts.length && !choice) {
                conflict = { items: merged.conflicts, local, remote };
                status('同步已暂停：有记录需要选择保留版本，请到「指南」处理');
                return;
            }
            conflict = null;
            resolution = null;
            // 云端修改先备份，再写数据库，备份失败则停止合并。
            if (!equal(local, merged.data)) preserve(recentBackup, local);
            if (!row || !equal(remote, merged.data)) {
                const result = await client.rpc('save_weiguang_sync', {
                    expected_revision: row?.revision || 0, new_payload: merged.data
                });
                if (result.error) throw result.error;
                if (!result.data) { status('另一设备刚更新了记录，正在重新合并'); nextDelay = 500; return; }
            }
            if (ticket !== generation) return;
            // 请求发出后如果用户继续编辑，不替换界面或本地数据，下次重新读取合并。
            if (editing() || !equal(local, records(state.data))) { nextDelay = 1500; return; }
            if (!currentDisk()) throw new Error('another-tab');
            const changedData = !equal(local, merged.data);
            const next = { ...merged.data, _sync: { owner: user, enabled: true, base: merged.data } };
            if (!storage.save(next, { remote: true })) throw new Error('local-save');
            lastSynced = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            status('已同步');
            if (changedData) {
                storage.rememberMood();
                // 有未保存输入的心情草稿保留，未编辑过的已保存草稿随云端更新。
                for (const [date, draft] of state.moodDrafts) {
                    const before = local.moods[date];
                    if (draft.mood === (before?.mood ?? null) && draft.note === (before?.note || '')) state.moodDrafts.delete(date);
                }
                App.pages.renderPreservingPosition();
            }
        } catch (error) {
            if (ticket !== generation) return;
            if (error.message === 'another-tab') {
                externalChange = true;
                status('另一窗口已更新记录，请刷新本页后继续同步');
            } else if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
                status('云同步尚未初始化，请先执行建表 SQL；本地记录不受影响');
            } else if (error.message === 'invalid-local') {
                status('本地记录存在异常或重复 ID，已停止同步；请先导出备份检查');
            } else if (error.message === 'invalid-cloud' || error.message === 'Invalid record format') {
                status('云端记录格式异常，已停止同步；本地记录保持不变');
            } else {
                status('同步未完成，记录仍在本地；稍后自动重试');
            }
        } finally {
            busy = false;
            paint();
            if (!conflict) schedule(nextDelay);
        }
    }

    async function getClient() {
        if (client) return client;
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            if (window.supabase) { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'src/vendor/supabase-2.118.0.js';
            const timeout = setTimeout(() => { script.remove(); reject(new Error('SDK timeout')); }, 10000);
            script.onload = () => { clearTimeout(timeout); resolve(); };
            script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('SDK unavailable')); };
            document.head.appendChild(script);
        }).then(() => {
            client = window.supabase.createClient(settings.url, settings.key, {
                auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
                global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(20000) }) }
            });
            client.auth.onAuthStateChange((_event, next) => {
                // 回调保持同步，避免在 Auth 锁内等待其他 Supabase 方法。
                const previous = session?.user.id;
                session = next;
                if (previous !== session?.user.id) {
                    generation++;
                    conflict = null;
                    resolution = null;
                }
                describeSession();
                schedule(100);
            });
            return client;
        }).catch(error => { loading = null; throw error; });
        return loading;
    }
    function describeSession() {
        const meta = state.data?._sync;
        if (deleting) status('正在注销账号，自动同步已暂停');
        else if (meta?.deletionPending) status('注销结果尚未确认，自动同步已暂停；本地记录仍保留');
        else if (!session) status('未登录，记录保存在本地');
        else if (meta?.owner && meta.owner !== session.user.id) status('本地记录仍关联旧账号，当前未同步。若原账号已注销重建，可备份后重新关联当前账号；否则请登录原账号');
        else if (!meta?.enabled) status(meta?.owner ? '自动同步已关闭，记录仅保存在本地；登录状态保留' : '已登录，尚未开启同步；本地记录不会上传');
        else status('本地记录已就绪，等待同步');
    }
    async function start() {
        if (!window.location || !/^https?:$/.test(window.location.protocol)) return;
        window.addEventListener('online', () => schedule(100));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(100); });
        window.addEventListener('storage', event => {
            if (event.key === config.KEY) {
                generation++;
                externalChange = true;
                status('另一窗口已更新记录，请刷新本页后继续；本页输入仍保留');
            }
        });
        try {
            await getClient();
            const { data, error } = await client.auth.getSession();
            if (error) throw error;
            session = data.session;
            describeSession();
            schedule(100);
        } catch { status('登录服务暂不可用，记录继续保存在本地；可稍后重试登录'); }
    }
    function openDeleteAccount() {
        if (!session || deleting) return;
        if (state.data?._sync?.owner && state.data._sync.owner !== session.user.id) {
            App.components.toast('请先登录本地记录对应的账号，再操作注销。');
            return;
        }
        deleteTarget = session.user.id;
        generation++;
        clearTimeout(timer);
        App.dialogs.openModal(`<div class="modal-title"><h2>注销微光账号</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><p>将永久删除当前微光账号及全部云端同步记录，无法撤销。</p><p class="small muted">如果 GitHub 和 Google 已关联，两种登录身份会一起删除。不会删除你的 GitHub 或 Google 账号。</p><p class="small muted">此浏览器的活动、心情和本地备份会保留，其他设备上的本地副本也不会远程清除。以后重新登录会创建新账号；只有再次开启同步才会上传本地记录。</p><div class="field"><label for="deleteAccountText">输入「注销」确认</label><input id="deleteAccountText" autocomplete="off" maxlength="2" placeholder="注销"></div><p id="deleteAccountStatus" class="small muted" role="status"></p><div class="foot-actions"><button class="btn btn-outline" data-action="export">先导出记录</button><button class="btn btn-outline" data-action="close">取消</button><button class="btn btn-outline account-delete" data-action="syncDeleteConfirm">确认注销账号</button></div>`);
        utils.$('#deleteAccountText')?.focus();
    }

    async function deleteAccount() {
        const target = deleteTarget;
        if (deleting || !target || !session || session.user.id !== target) return;
        if (utils.$('#deleteAccountText')?.value !== '注销') {
            App.components.toast('请输入「注销」后再确认。');
            return;
        }
        // 先持久化暂停状态。请求结果不明确时也不恢复上传，避免重新上传待删除内容。
        const next = structuredClone(state.data);
        next._sync = { owner: target, base: next._sync?.base || empty(), enabled: false, deletionPending: true };
        if (!storage.save(next, { remote: true })) return;
        deleting = true;
        generation++;
        clearTimeout(timer);
        conflict = null;
        resolution = null;
        const button = utils.$('[data-action="syncDeleteConfirm"]');
        if (button) button.disabled = true;
        const note = utils.$('#deleteAccountStatus');
        if (note) note.textContent = '正在注销，请稍候…';
        status('正在注销账号，自动同步已暂停');
        let deleted = false;
        try {
            await getClient();
            const token = session?.user.id === target ? session.access_token : null;
            if (!token) throw new Error('Session changed');
            const { data, error } = await client.functions.invoke('delete-account', {
                body: { confirmation: '注销', expectedUserId: target },
                headers: { Authorization: `Bearer ${token}` }
            });
            if (error || data?.deleted !== true || data.userId !== target) throw error || new Error('Deletion unconfirmed');
            deleted = true;
            const local = structuredClone(state.data);
            delete local._sync;
            // 保留原始本地记录，仅解除已经删除的账号关联。
            const saved = storage.save(local, { remote: true });
            try { await client.auth.signOut({ scope: 'local' }); } catch { /* 服务端账号已删除。 */ }
            session = null;
            lastSynced = '';
            if (utils.$('#deleteAccountText')) App.dialogs.closeModal();
            status(saved ? '账号及云端记录已注销，本地记录保留' : '云端账号已注销，本地关联未清理；请先导出备份，再解除本地关联');
        } catch {
            const message = '注销未确认：请检查网络和服务端配置后重试；同步保持关闭，本地记录仍保留。';
            if (note) note.textContent = message;
            status(message);
        } finally {
            deleting = false;
            if (button) button.disabled = false;
            deleteTarget = deleted ? null : target;
            paint();
        }
    }

    async function action(name, provider = 'github') {
        try {
            if (deleting) return;
            if (name === 'syncDelete') { openDeleteAccount(); return; }
            if (name === 'syncDeleteConfirm') { await deleteAccount(); return; }
            if (name === 'syncRelink') {
                const owner = state.data?._sync?.owner;
                if (!session || !owner || owner === session.user.id) return;
                const account = session.user.email || session.user.user_metadata?.user_name || '当前登录账号';
                if (!confirm(`将本地记录从旧账号重新关联到「${account}」。会先自动备份，保留所有本地记录；自动同步保持关闭。再次开启同步时，本地记录会与此账号的云端记录合并。这不会确认或删除旧账号。确定重新关联吗？`)) return;
                if (!currentDisk()) {
                    App.components.toast('另一窗口已更新记录，请刷新后再重新关联。');
                    return;
                }
                preserve(recentBackup, state.data);
                const next = structuredClone(state.data);
                // 新账号必须从空基线重新合并，不能沿用旧账号的删除历史。
                next._sync = { owner: session.user.id, enabled: false, base: empty() };
                if (!storage.save(next, { remote: true })) return;
                generation++;
                clearTimeout(timer);
                conflict = null;
                resolution = null;
                deleteTarget = null;
                lastSynced = '';
                status('已重新关联当前账号，本地记录已备份；自动同步仍关闭，可手动开启');
                return;
            }
            if (name === 'syncDetach') {
                if (!state.data?._sync?.deletionPending || !confirm('解除本地账号关联并保留记录；这不会删除或确认删除云端账号。确定吗？')) return;
                const next = structuredClone(state.data);
                delete next._sync;
                if (!storage.save(next, { remote: true })) return;
                generation++;
                clearTimeout(timer);
                describeSession();
                return;
            }
            if (name === 'syncBackup' || name === 'syncInitialBackup') {
                const saved = localStorage.getItem(name === 'syncBackup' ? recentBackup : firstBackup);
                if (!saved) { App.components.toast('暂时没有这份备份'); return; }
                backup.exportData(JSON.parse(saved).data, name === 'syncBackup' ? '微光-合并前备份' : '微光-首次同步前备份');
                return;
            }
            if (name === 'syncDisable') {
                // 纯本地开关，离线或登录服务暂不可用时也可以关闭。
                if (!session || state.data?._sync?.owner !== session.user.id || !state.data._sync.enabled) return;
                const next = structuredClone(state.data);
                next._sync.enabled = false;
                if (!storage.save(next, { remote: true })) return;
                generation++;
                clearTimeout(timer);
                conflict = null;
                resolution = null;
                describeSession();
                return;
            }
            await getClient();
            if (name === 'syncLogin') {
                if (!['github', 'google'].includes(provider)) throw new Error('Unsupported login provider');
                if (!window.location || !/^https?:$/.test(window.location.protocol)) {
                    App.components.toast('请通过已部署的网站或本地 HTTP 服务使用登录'); return;
                }
                const here = window.location;
                const redirectTo = here.origin === 'http://localhost:8000' || here.origin === 'http://127.0.0.1:8000'
                    ? here.origin + here.pathname : settings.redirect;
                const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
                if (error) throw error;
            } else if (name === 'syncLogout') {
                generation++;
                conflict = null;
                resolution = null;
                const { error } = await client.auth.signOut({ scope: 'local' });
                if (error) throw error;
                session = null;
                describeSession();
            } else if (name === 'syncEnable') {
                if (!session || state.data._sync?.deletionPending || (state.data._sync?.owner && state.data._sync.owner !== session.user.id)) return;
                if (!confirm('开启后，当前活动和心情记录将与当前账号的云端记录合并，并上传至 Supabase。是否开启？')) return;
                if (!localStorage.getItem(firstBackup)) preserve(firstBackup, state.data);
                const next = structuredClone(state.data);
                next._sync = { owner: session.user.id, enabled: true, base: next._sync?.base || empty() };
                if (storage.save(next, { remote: true })) { generation++; schedule(0); status('已开启，等待同步'); }
            } else if (name === 'syncNow') {
                resolution = null;
                await run();
            } else if ((name === 'syncLocal' || name === 'syncCloud') && conflict) {
                const prefer = name === 'syncLocal' ? 'local' : 'cloud';
                if (!confirm(`将为冲突记录保留${prefer === 'local' ? '本地' : '云端'}版本。其他记录正常合并，本地现状会在替换前自动备份。确定吗？`)) return;
                resolution = { local: conflict.local, remote: conflict.remote, prefer };
                await run();
            }
        } catch { status('操作未完成，请稍后重试；本地记录仍保留'); }
    }
    Object.assign(App.sync, { start, changed, panel, action, merge, settings });
})(window.Weiguang);
