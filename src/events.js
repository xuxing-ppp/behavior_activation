// 按钮、表单与键盘事件；调用对应功能模块。
(function (App) {
    'use strict';
    const { activities, backup, components, config, dialogs, library, pages, state, storage, utils } = App;

    function handleClick(ev) {
        const btn = ev.target.closest('button[data-page],button[data-action],button[data-rate]');
        if (!btn)
            return;
        storage.rememberMood();
        if (btn.dataset.page) {
            pages.setPage(btn.dataset.page);
            return;
        }
        if (btn.dataset.rate) {
            const score = Number(btn.dataset.score), key = btn.dataset.rate;
            if (key === 'mood')
                storage.draftMood().mood = score;
            else
                utils.$(`#completeForm [name="${key}"]`).value = score;
            document.querySelectorAll(`[data-rate="${key}"]`).forEach(el => {
                el.classList.toggle('selected', Number(el.dataset.score) === score);
                el.setAttribute('aria-pressed', Number(el.dataset.score) === score);
            });
            return;
        }
        const id = btn.dataset.id;
        switch (btn.dataset.action) {
            case 'add':
                dialogs.activityModal();
                break;
            case 'edit':
                dialogs.activityModal(id);
                break;
            case 'openLibrary':
                pages.openLibrary();
                break;
            case 'homePresetNext':
                state.homePresetOffset += 3;
                pages.renderPreservingPosition('[data-action="homePresetNext"]');
                break;
            case 'presetCategory':
                if (btn.dataset.category === 'all' || Object.hasOwn(config.categories, btn.dataset.category)) {
                    state.libraryState.category = btn.dataset.category;
                    state.libraryState.limit = 6;
                    pages.renderPreservingPosition(`[data-action="presetCategory"][data-category="${state.libraryState.category}"]`);
                }
                break;
            case 'presetShort':
                state.libraryState.shortOnly = !state.libraryState.shortOnly;
                state.libraryState.limit = 6;
                pages.renderPreservingPosition('[data-action="presetShort"]');
                break;
            case 'presetMore': {
                const previous = state.libraryState.limit;
                const next = library.filteredPresets()[previous];
                state.libraryState.limit += 6;
                pages.renderPreservingPosition(next ? `[data-preset-card="${next.id}"] [data-action="presetAdd"], [data-preset-card="${next.id}"] [data-action="presetView"]` : '#libraryTitle');
                break;
            }
            case 'presetAdd':
                library.addPreset(btn.dataset.presetId);
                break;
            case 'presetAdjust':
                library.adjustPreset(btn.dataset.presetId);
                break;
            case 'presetView':
                pages.viewPreset(id);
                break;
            case 'start':
                dialogs.startModal(id);
                break;
            case 'shrink':
                dialogs.shrinkModal(id);
                break;
            case 'complete':
                activities.completeActivity(id);
                break;
            case 'feedback':
                dialogs.completionModal(id);
                break;
            case 'undo':
                activities.undoLast(id);
                break;
            case 'clearRating': {
                const key = btn.dataset.kind;
                utils.$(`#completeForm [name="${key}"]`).value = '';
                document.querySelectorAll(`[data-rate="${key}"]`).forEach(el => {
                    el.classList.remove('selected');
                    el.setAttribute('aria-pressed', 'false');
                });
                break;
            }
            case 'duration':
                utils.$('#smallMinutes').value = btn.dataset.min;
                dialogs.syncDuration();
                break;
            case 'nextSuggestion': {
                storage.rememberMood();
                const pending = activities.dailyTasks(utils.localDate()).filter(a => !a.status);
                const i = pending.findIndex(a => a.id === state.recommendationId);
                state.recommendationId = pending[((i < 0 ? 0 : i) + 1) % pending.length]?.id;
                pages.render();
                utils.$('.next-step [data-action="start"]')?.focus();
                break;
            }
            case 'repeat': {
                const a = state.data.activities.find(x => x.id === id);
                if (a)
                    dialogs.activityModal(null, {
                        title: a.title, category: a.category, minutes: a.minutes, step: a.step, why: a.why, date: utils.localDate()
                    });
                break;
            }
            case 'skip':
                dialogs.skipModal(id);
                break;
            case 'close':
                dialogs.closeModal();
                break;
            case 'dayPrev':
                pages.changeDate(utils.dayAdd(state.selectedDate, -1));
                break;
            case 'dayNext':
                pages.changeDate(utils.dayAdd(state.selectedDate, 1));
                break;
            case 'goToday':
                pages.changeDate(utils.localDate());
                break;
            case 'chooseDay':
                pages.changeDate(btn.dataset.date);
                break;
            case 'saveMood': {
                storage.rememberMood();
                const draft = storage.draftMood();
                if (draft.mood == null) {
                    components.toast('先选择一个 0–10 的心情分数');
                    return;
                }
                if (!storage.commit(next => next.moods[state.selectedDate] = { mood: draft.mood, note: draft.note.trim().slice(0, 1200), updated: Date.now() }))
                    return;
                state.moodDrafts.delete(state.selectedDate);
                pages.render();
                components.toast('心情已记录。谢谢你照顾自己。');
                break;
            }
            case 'quick':
                dialogs.activityModal(null, activities.copyDefaults(btn.dataset.kind));
                break;
            case 'delete':
                if (confirm('确认删除这条活动及其反馈记录吗？')) {
                    if (!storage.commit(next => next.activities = next.activities.filter(a => a.id !== id)))
                        return;
                    state.undoRecord = null;
                    activities.finishMutation('活动已删除');
                }
                break;
            case 'reset':
                if (!storage.updateActivity(id, a => {
                    a.status = '';
                    activities.clearFeedback(a);
                }))
                    return;
                state.undoRecord = null;
                activities.finishMutation('已恢复为待尝试');
                break;
            case 'export':
                backup.exportData();
                break;
            case 'import':
                utils.$('#importFile').click();
                break;
            case 'clear':
                if (confirm('确定清除所有活动和心情记录吗？此操作不可撤销。') && confirm('再次确认：真的要永久清空这个浏览器中的所有记录吗？')) {
                    if (!storage.save(structuredClone(config.defaults)))
                        return;
                    state.moodDrafts.clear();
                    state.undoRecord = null;
                    pages.render();
                    components.toast('已清除全部本地记录');
                }
                break;
        }
    }

    function submit(ev) {
        const formType = ev.target.getAttribute('id');
        if (!['activityForm', 'completeForm', 'skipForm', 'shrinkForm'].includes(formType))
            return;
        ev.preventDefault();
        const f = new FormData(ev.target), id = String(f.get('id') || '');
        storage.rememberMood();
        if (formType === 'activityForm') {
            const title = String(f.get('title') || '').trim(), date = String(f.get('date') || ''), minutes = Number(f.get('minutes'));
            if (!title || !utils.isDate(date) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
                components.toast('请检查活动名称、日期和分钟数');
                return;
            }
            const old = state.data.activities.find(a => a.id === id);
            const presetId = old?.presetId || (config.PRESET_BY_ID.has(f.get('presetId')) ? f.get('presetId') : undefined);
            if (presetId && library.existingPreset(presetId, date, id)) {
                components.toast('这一天已经安排过这项活动，可以换一天安排。');
                return;
            }
            const activity = {
                ...old, id: id || utils.uid(), title: title.slice(0, 90), date, time: String(f.get('time') || ''), minutes, category: Object.hasOwn(config.categories, f.get('category')) ? f.get('category') : 'care', step: String(f.get('step') || '').trim().slice(0, 130), why: String(f.get('why') || '').trim().slice(0, 150), status: old?.status || '', created: old?.created || Date.now(), presetId
            };
            if (!storage.commit(next => {
                const index = next.activities.findIndex(x => x.id === id);
                if (index >= 0)
                    next.activities[index] = activity;
                else
                    next.activities.push(activity);
            }))
                return;
            state.selectedDate = date;
            if (!old && presetId) {
                dialogs.closeModal();
                library.addedPreset(activity);
            }
            else
                activities.finishMutation(id ? '计划已更新' : '小计划已加入');
            return;
        }
        const a = state.data.activities.find(x => x.id === id);
        if (!a)
            return;
        if (formType === 'shrinkForm') {
            const step = String(f.get('step') || '').trim(), minutes = Number(f.get('minutes'));
            if (!step || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
                components.toast('请填写一小步和有效分钟数');
                return;
            }
            if (!storage.updateActivity(id, a => {
                a.step = step.slice(0, 130);
                a.minutes = minutes;
                if (a.status === 'skipped') {
                    a.status = '';
                    delete a.skipReason;
                }
            }))
                return;
            activities.finishMutation('已缩小计划，按这个版本试试就好');
            return;
        }
        if (formType === 'completeForm') {
            if (!storage.updateActivity(id, a => {
                for (const key of ['pleasure', 'mastery']) {
                    const value = f.get(key);
                    if (value === '')
                        delete a[key];
                    else if (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 10)
                        a[key] = Number(value);
                }
                a.note = String(f.get('note') || '').trim().slice(0, 700);
                a.feedbackAt = Date.now();
            }))
                return;
            state.undoRecord = null;
            activities.finishMutation('感受已保存');
            return;
        }
        const tomorrow = ev.submitter?.value === 'tomorrow';
        if (tomorrow && a.presetId && library.existingPreset(a.presetId, utils.dayAdd(utils.localDate(), 1), a.id)) {
            components.toast('明天已经安排了这项活动，可以在安排页查看或调整。');
            return;
        }
        if (!storage.updateActivity(id, a => {
            activities.clearFeedback(a);
            if (tomorrow) {
                a.date = utils.dayAdd(utils.localDate(), 1);
                a.status = '';
                a.time = '';
            }
            else {
                a.status = 'skipped';
                a.skipReason = String(f.get('reason') || '');
            }
        }))
            return;
        state.undoRecord = null;
        activities.finishMutation(tomorrow ? '已改到明天，没有增加重复计划' : '已暂缓。需要时再调整就好');
    }

    const handleInput = ev => {
        if (ev.target.id === 'moodNote')
            storage.rememberMood();
        if (ev.target.id === 'smallMinutes')
            dialogs.syncDuration();
    };

    const handleKeydown = ev => {
        const modal = utils.$('#modalLayer .modal');
        if (!modal)
            return;
        if (ev.key === 'Escape') {
            ev.preventDefault();
            dialogs.closeModal();
            return;
        }
        if (ev.key === 'Tab') {
            const items = [...modal.querySelectorAll('button:not([disabled]),input:not([type="hidden"]):not([disabled]),select,textarea,[tabindex="0"]')].filter(x => x.getClientRects().length);
            const first = items[0], last = items[items.length - 1];
            if (ev.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
                ev.preventDefault();
                last?.focus();
            }
            else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault();
                first?.focus();
            }
        }
    };

    const handleBackdropClick = ev => {
        if (ev.target?.id === 'modalLayer')
            dialogs.closeModal();
    };

    Object.assign(App.events, { handleClick, submit, handleInput, handleKeydown, handleBackdropClick });
})(window.Weiguang);
