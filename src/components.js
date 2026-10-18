// 导航、提示、活动列表和评分等可复用界面组件。
(function (App) {
    'use strict';
    const { activities, config, state, utils } = App;

    function toast(s) {
        const n = utils.$('#snack');
        n.textContent = s;
        n.style.display = 'block';
        clearTimeout(toast.t);
        toast.t = setTimeout(() => n.style.display = 'none', 2700);
    }

    function notifyWithActions(message, actions) {
        toast(message);
        clearTimeout(toast.t);
        const group = document.createElement('span');
        group.className = 'snack-actions';
        for (const { action, id, label } of actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.action = action;
            button.dataset.id = id;
            button.textContent = label;
            group.appendChild(button);
        }
        utils.$('#snack').appendChild(group);
        toast.t = setTimeout(() => utils.$('#snack').style.display = 'none', 15000);
    }

    function nav() {
        const html = config.tabs.map(([id, icon, label]) => `<button data-page="${id}" class="${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}><span class="nav-icon">${icon}</span> ${label}</button>`).join('');
        utils.$('#deskNav').innerHTML = html;
        utils.$('#mobNav').innerHTML = config.tabs.map(([id, icon, label]) => `<button data-page="${id}" class="${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}><span>${icon}</span>${label}</button>`).join('');
    }

    function dateControls() {
        return `<div class="day-control"><button data-action="dayPrev" aria-label="前一天">‹</button><span class="date-label">${utils.humanDate(state.selectedDate)}</span><button data-action="dayNext" aria-label="后一天">›</button>${state.selectedDate !== utils.localDate() ? '<button data-action="goToday">回到今天</button>' : ''}</div>`;
    }

    function feedbackSummary(a) {
        return [a.pleasure != null ? '愉悦 ' + a.pleasure + '/10' : '', a.mastery != null ? '成就 ' + a.mastery + '/10' : ''].filter(Boolean).join(' · ');
    }

    function dateHeading() {
        const d = new Date();
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${'日一二三四五六'[d.getDay()]}`;
    }

    function taskItem(a) {
        const [icon, name] = config.categories[a.category] || config.categories.care;
        const st = a.status;
        const id = utils.e(a.id);
        const primary = st === 'done' ? `<span class="tag done">✓ 已完成</span><button class="mini" data-action="feedback" data-id="${id}">${a.feedbackAt ? '修改感受' : '补充感受'}</button>` : st === 'skipped' ? `<span class="tag skip">↪ 暂缓</span>` : `${a.date === utils.localDate() ? `<button class="mini" data-action="start" data-id="${id}">开始</button>` : ''}<button class="mini" data-action="complete" data-id="${id}">做到了</button>`;
        return `<div class="task ${st || ''}" data-task-id="${id}"><div class="task-icon" aria-hidden="true">${icon}</div><div class="task-info"><h3>${utils.e(a.title)}</h3><p>${a.time ? utils.e(a.time) + ' · ' : ''}${utils.e(a.minutes)} 分钟 · ${name}${a.step ? ' · 第一步：' + utils.e(a.step) : ''}</p>${st === 'done' && feedbackSummary(a) ? `<p>${feedbackSummary(a)}</p>` : ''}${st === 'skipped' && a.skipReason ? `<p>${utils.e(a.skipReason)}</p>` : ''}</div><div class="task-actions">${primary}<button class="mini" data-action="edit" data-id="${id}" aria-label="编辑 ${utils.e(a.title)}">调整</button></div></div>`;
    }

    function taskList(s) {
        const a = activities.dailyTasks(s);
        return a.length ? `<div class="stack">${a.map(taskItem).join('')}</div>` : `<div class="empty"><div class="flower">🌱</div>这一天还没有计划。<br><span class="small">从一件只需要 5 分钟的事开始就很好。</span></div>`;
    }

    function ratingButtons(selected, prefix) {
        const labels = { mood: '情绪', pleasure: '愉悦感', mastery: '成就感' };
        return `<div class="rating-row" role="group" aria-label="${labels[prefix]}评分">${Array.from({ length: 11 }, (_, n) => `<button type="button" class="rating ${selected === n ? 'selected' : ''}" data-rate="${prefix}" data-score="${n}" aria-label="${labels[prefix]} ${n} 分" aria-pressed="${selected === n}">${n}</button>`).join('')}</div>`;
    }

    function moodCard() {
        const saved = state.data.moods[state.selectedDate], draft = state.moodDrafts.get(state.selectedDate);
        const m = draft?.mood ?? saved?.mood ?? null;
        return `<div class="card"><div class="card-head"><div><h2>给此刻留个记号</h2><p class="muted small">心情 0 很低落 · 10 很愉快</p></div><span class="tag">${saved ? '已记录' : '可选记录'}</span></div>${ratingButtons(m, 'mood')}<div class="field"><label for="moodNote">这一刻有什么感受？（选填）</label><textarea id="moodNote" maxlength="1200" rows="2" placeholder="一两句话就好，也可以留空">${utils.e(draft?.note ?? saved?.note ?? '')}</textarea></div><div class="mood-footer"><span class="small muted">可以先行动，想记录时再回来。</span><button class="btn btn-primary" data-action="saveMood">${saved ? '更新心情' : '保存心情'}</button></div><p class="status-note">未保存的草稿在本次页面切换中保留，刷新后不保留。</p></div>`;
    }

    Object.assign(App.components, {
        toast, notifyWithActions, nav, dateControls, feedbackSummary, dateHeading, taskItem, taskList, ratingButtons, moodCard
    });
})(window.Weiguang);
