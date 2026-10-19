// 本地记录的读取与原子写入，以及按日期保存的心情草稿。
(function (App) {
    'use strict';
    const { components, config, state, utils } = App;

    function load() {
        try {
            const x = JSON.parse(localStorage.getItem(config.KEY));
            return valid(x) ? x : structuredClone(config.defaults);
        }
        catch {
            return structuredClone(config.defaults);
        }
    }

    function valid(x) {
        return x && typeof x === 'object' && Array.isArray(x.activities) && x.moods && typeof x.moods === 'object' && !Array.isArray(x.moods);
    }

    function save(candidate, options = {}) {
        try {
            let disk = null;
            try { disk = JSON.parse(localStorage.getItem(config.KEY)); } catch { /* 损坏的旧记录允许重新保存。 */ }
            if (valid(disk) && state.data && JSON.stringify(disk) !== JSON.stringify(state.data)) {
                components.toast('另一窗口已更新记录，请刷新本页后再保存；当前输入仍保留。');
                return false;
            }
            if (!options.remote && state.data?._sync)
                candidate._sync = structuredClone(state.data._sync);
            if (options.localClear)
                candidate._sync = { owner: state.data?._sync?.owner || null, base: structuredClone(config.defaults), enabled: false };
            localStorage.setItem(config.KEY, JSON.stringify(candidate));
            state.data = candidate;
            state.undoRecord = null;
            if (!options.remote) App.sync.changed?.();
            return true;
        }
        catch {
            components.toast('尚未保存：本地存储失败，输入已保留，请重试或导出备份。');
            return false;
        }
    }

    function commit(change) {
        const next = structuredClone(state.data);
        change(next);
        return save(next);
    }

    function updateActivity(id, change) {
        return commit(next => {
            const a = next.activities.find(x => x.id === id);
            if (a)
                change(a);
        });
    }

    function draftMood() {
        if (!state.moodDrafts.has(state.selectedDate)) {
            const saved = state.data.moods[state.selectedDate];
            state.moodDrafts.set(state.selectedDate, { mood: saved?.mood ?? null, note: saved?.note || '' });
        }
        return state.moodDrafts.get(state.selectedDate);
    }

    function rememberMood() {
        const input = utils.$('#moodNote');
        if (input)
            draftMood().note = input.value;
    }

    Object.assign(App.storage, { load, valid, save, commit, updateActivity, draftMood, rememberMood });
})(window.Weiguang);
