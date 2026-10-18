// JSON 备份的导出、校验与恢复。
(function (App) {
    'use strict';
    const { components, config, pages, state, storage, utils } = App;

    function exportData() {
        const payload = {
            app: '微光-行为激活', exportedAt: new Date().toISOString(), version: 1, activities: state.data.activities, moods: state.data.moods
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        a.download = '微光-行为激活-' + utils.localDate() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 500);
        components.toast('备份文件已导出');
    }

    function importedPresetId(value) {
        return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value) ? value : undefined;
    }

    const importData = async (ev) => {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        if (!file)
            return;
        if (file.size > 5000000) {
            components.toast('文件过大，已拒绝导入');
            return;
        }
        try {
            const obj = JSON.parse(await file.text());
            if (!storage.valid(obj) || obj.activities.length > 30000) {
                components.toast('文件格式不符合本应用的备份格式');
                return;
            }
            const clean = { activities: [], moods: {}, version: 1 };
            for (const x of obj.activities) {
                if (!x || typeof x.title !== 'string' || typeof x.date !== 'string' || typeof x.id !== 'string' || !utils.isDate(x.date))
                    continue;
                clean.activities.push({
                    id: x.id.slice(0, 100), presetId: importedPresetId(x.presetId), title: x.title.slice(0, 90), date: x.date, time: typeof x.time === 'string' ? x.time.slice(0, 5) : '', minutes: Math.max(1, Math.min(1440, Math.round(Number(x.minutes) || 5))), category: Object.hasOwn(config.categories, x.category) ? x.category : 'care', step: typeof x.step === 'string' ? x.step.slice(0, 130) : '', why: typeof x.why === 'string' ? x.why.slice(0, 150) : '', status: ['', 'done', 'skipped'].includes(x.status) ? x.status : '', created: Number(x.created) || Date.now(), feedbackAt: Number.isFinite(x.feedbackAt) ? x.feedbackAt : undefined, pleasure: Number.isInteger(x.pleasure) ? Math.max(0, Math.min(10, x.pleasure)) : undefined, mastery: Number.isInteger(x.mastery) ? Math.max(0, Math.min(10, x.mastery)) : undefined, note: typeof x.note === 'string' ? x.note.slice(0, 700) : '', skipReason: typeof x.skipReason === 'string' ? x.skipReason.slice(0, 150) : ''
                });
            }
            for (const [s, v] of Object.entries(obj.moods)) {
                if (utils.isDate(s) && v && Number.isInteger(v.mood) && v.mood >= 0 && v.mood <= 10)
                    clean.moods[s] = {
                        mood: v.mood, note: typeof v.note === 'string' ? v.note.slice(0, 1200) : '', updated: Number(v.updated) || Date.now()
                    };
            }
            if (!confirm(`将导入 ${clean.activities.length} 条活动记录，并覆盖当前所有本地记录，确定吗？`))
                return;
            if (!storage.save(clean))
                return;
            state.moodDrafts.clear();
            state.undoRecord = null;
            pages.render();
            components.toast('记录已导入');
        }
        catch {
            components.toast('无法读取文件，请确认它是有效的 JSON 备份');
        }
    };

    Object.assign(App.backup, { exportData, importedPresetId, importData });
})(window.Weiguang);
