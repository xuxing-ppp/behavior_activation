// 活动查询、完成、撤销以及修改后的界面反馈。
(function (App) {
    'use strict';
    const { components, dialogs, pages, state, storage, utils } = App;

    function dailyTasks(s) {
        return state.data.activities.filter(x => x.date === s).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.created || 0) - (b.created || 0));
    }

    function progress(s) {
        const a = dailyTasks(s), done = a.filter(x => x.status === 'done').length;
        return [done, a.length];
    }

    function clearFeedback(a) {
        delete a.pleasure;
        delete a.mastery;
        delete a.note;
        delete a.feedbackAt;
        delete a.skipReason;
    }

    function completeActivity(id) {
        const activity = state.data.activities.find(x => x.id === id);
        if (!activity || activity.status === 'done')
            return;
        const before = structuredClone(activity);
        if (!storage.updateActivity(id, a => {
            clearFeedback(a);
            a.status = 'done';
        }))
            return;
        state.undoRecord = { kind: 'complete', id, before };
        finishMutation('完成已记录。这一步很珍贵。');
        components.notifyWithActions('完成已记录。这一步很珍贵。', [
            { action: 'undo', id, label: '撤销' }, { action: 'feedback', id, label: '补充感受' }
        ]);
    }

    function copyDefaults(kind) {
        return kind === 'two' ? { title: '尝试两分钟的小行动', minutes: 2, category: 'care', step: '选择现在最容易开始的一件事' } : null;
    }

    function undoLast(id) {
        const record = state.undoRecord;
        if (!record || record.id !== id)
            return;
        const ok = record.kind === 'preset'
            ? storage.commit(next => next.activities = next.activities.filter(a => a.id !== id))
            : storage.updateActivity(id, a => {
                Object.keys(a).forEach(key => delete a[key]);
                Object.assign(a, record.before);
            });
        if (!ok)
            return;
        if (record.kind === 'preset') {
            pages.renderPreservingPosition(`[data-action="presetAdd"][data-preset-id="${record.presetId || ''}"]`);
            components.toast('已撤销加入，活动灵感仍在这里');
        }
        else
            finishMutation('已撤销完成记录');
    }

    function finishMutation(message) {
        dialogs.closeModal();
        pages.render();
        utils.$('#content').focus({ preventScroll: true });
        components.toast(message);
    }

    Object.assign(App.activities, { dailyTasks, progress, clearFeedback, completeActivity, copyDefaults, undoLast, finishMutation });
})(window.Weiguang);
