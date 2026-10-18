// 活动灵感库的筛选、卡片、一键加入和调整入口。
(function (App) {
    'use strict';
    const { components, config, dialogs, pages, state, storage, utils } = App;

    function orderedPresets() {
        const groups = Object.keys(config.categories).map(category => config.PRESETS.filter(p => p.category === category));
        const rounds = Math.max(0, ...groups.map(group => group.length));
        return Array.from({ length: rounds }, (_, index) => groups.map(group => group[index])).flat().filter(Boolean);
    }

    function filteredPresets() {
        return orderedPresets().filter(p => (state.libraryState.category === 'all' || p.category === state.libraryState.category) && (!state.libraryState.shortOnly || p.minutes <= 5));
    }

    function homePresets() {
        const first = ['care-drink', 'move-outside', 'joy-album'];
        const pool = [...first.map(id => config.PRESET_BY_ID.get(id)), ...orderedPresets().filter(p => p.minutes <= 5 && !first.includes(p.id))];
        return Array.from({ length: 3 }, (_, index) => pool[(state.homePresetOffset + index) % pool.length]);
    }

    function existingPreset(presetId, date = state.selectedDate, exceptId = '') {
        return state.data.activities.find(a => a.presetId === presetId && a.date === date && a.id !== exceptId);
    }

    function presetProposal(preset, date = state.selectedDate) {
        return {
            presetId: preset.id, title: preset.title, category: preset.category, minutes: preset.minutes, step: preset.step, why: '', time: '', date
        };
    }

    function presetCard(preset, compact = false) {
        const existing = existingPreset(preset.id);
        const [icon, label] = config.categories[preset.category];
        const status = existing ? ({ done: '已完成', skipped: '已暂缓' }[existing.status] || '已加入') : '';
        return `<article class="preset-card${compact ? ' preset-compact' : ''}" data-preset-card="${preset.id}" aria-labelledby="preset-title-${preset.id}">
    <div class="preset-meta"><span>${icon} ${label}</span><span>约 ${preset.minutes} 分钟</span></div>
    <h3 id="preset-title-${preset.id}">${utils.e(preset.title)}</h3>
    <p class="preset-first"><span>第一步</span>${utils.e(preset.step)}</p>
    <div class="preset-actions">${existing ?
            `<span class="tag ${existing.status === 'done' ? 'done' : existing.status === 'skipped' ? 'skip' : ''}">${status}</span><button class="btn btn-text" data-action="presetView" data-id="${utils.e(existing.id)}" aria-label="查看计划：${utils.e(preset.title)}">查看计划 →</button>` :
            `<button class="btn btn-primary" data-action="presetAdd" data-preset-id="${preset.id}" aria-label="加入计划：${utils.e(preset.title)}">＋ 加入计划</button><button class="btn btn-text" data-action="presetAdjust" data-preset-id="${preset.id}" aria-label="调整后加入：${utils.e(preset.title)}">调整后加入</button>`}
    </div>
  </article>`;
    }

    function activityLibrary() {
        const results = filteredPresets();
        const visible = results.slice(0, state.libraryState.limit);
        const count = `显示 ${visible.length} / ${results.length} 项活动`;
        return `<section class="card activity-library" id="activityLibrary" aria-labelledby="libraryTitle">
    <header class="card-head"><div><div class="eyebrow">A LITTLE INSPIRATION</div><h2 id="libraryTitle" tabindex="-1">找一件想试试的小事</h2><p class="muted small">一点投入，一点新鲜感。按自己的情况选一件就好。</p></div><button class="btn btn-outline" data-action="add">＋ 自己写一件</button></header>
    <div class="library-date"><span>加入到 <strong>${utils.humanDate(state.selectedDate)}</strong></span>${state.selectedDate !== utils.localDate() ? '<button class="btn btn-text" data-action="goToday">回到今天</button>' : ''}</div>
    <div class="library-filters" role="group" aria-label="活动类别筛选">
      ${[['all', '全部'], ...Object.entries(config.categories).map(([id, [icon, label]]) => [id, icon + ' ' + label])].map(([id, label]) => `<button class="pill ${state.libraryState.category === id ? 'active' : ''}" data-action="presetCategory" data-category="${id}" aria-pressed="${state.libraryState.category === id}">${label}</button>`).join('')}
    </div>
    <div class="library-tools"><button class="pill ${state.libraryState.shortOnly ? 'active' : ''}" data-action="presetShort" aria-pressed="${state.libraryState.shortOnly}">◷ 5 分钟以内</button><span class="small muted" role="status" aria-live="polite">${count}</span></div>
    <div class="preset-grid">${visible.map(p => presetCard(p)).join('')}</div>
    ${results.length > visible.length ? `<div class="library-more"><button class="btn btn-soft" data-action="presetMore">查看更多 · 还有 ${results.length - visible.length} 项</button></div>` : ''}
    <p class="status-note">活动和时长都可以修改。联系他人的活动，主动联系或发出邀请就算迈出这一步。</p>
  </section>`;
    }

    function addedPreset(activity) {
        state.undoRecord = { kind: 'preset', id: activity.id, presetId: activity.presetId };
        const selector = state.page === 'plan' ? `[data-action="presetView"][data-id="${activity.id}"]` : `[data-action="start"][data-id="${activity.id}"]`;
        pages.renderPreservingPosition(selector);
        components.notifyWithActions(`已加入${utils.humanDate(activity.date)}的计划`, [{ action: 'undo', id: activity.id, label: '撤销' }]);
    }

    function addPreset(presetId) {
        const preset = config.PRESET_BY_ID.get(presetId);
        if (!preset)
            return;
        const existing = existingPreset(presetId);
        if (existing) {
            pages.viewPreset(existing.id);
            return;
        }
        const activity = { ...presetProposal(preset), id: utils.uid(), status: '', created: Date.now() };
        if (!storage.commit(next => next.activities.push(activity)))
            return;
        addedPreset(activity);
    }

    function adjustPreset(presetId) {
        const preset = config.PRESET_BY_ID.get(presetId);
        if (!preset)
            return;
        const existing = existingPreset(presetId);
        if (existing) {
            pages.viewPreset(existing.id);
            return;
        }
        dialogs.activityModal(null, presetProposal(preset));
    }

    Object.assign(App.library, {
        orderedPresets, filteredPresets, homePresets, existingPreset, presetProposal, presetCard, activityLibrary, addedPreset, addPreset, adjustPreset
    });
})(window.Weiguang);
