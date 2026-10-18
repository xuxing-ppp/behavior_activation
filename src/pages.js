// 四个页面的内容，以及页面、日期和滚动位置管理。
(function (App) {
    'use strict';
    const { activities, components, config, library, state, storage, utils } = App;

    function todayPage() {
        const tasks = activities.dailyTasks(state.selectedDate), pending = tasks.filter(x => !x.status), done = tasks.filter(x => x.status === 'done').length;
        const activity = pending.find(x => x.id === state.recommendationId) || pending[0];
        const isToday = state.selectedDate === utils.localDate();
        return `<header class="daily-heading"><div><div class="eyebrow">ONE SMALL STEP</div><h1>${isToday ? '从一小步开始。' : utils.humanDate(state.selectedDate) + '的记录'}</h1><p class="muted small">${isToday ? '不用一次做好全部，先选现在能做的一点。' : '这是' + (state.selectedDate < utils.localDate() ? '过去' : '未来') + '的日期。记录和调整会保存在这一天。'}</p></div>${components.dateControls()}</header>
  ${isToday ? `<section class="hero next-step" aria-labelledby="nextTitle"><div class="eyebrow">${activity ? '现在可以试试' : '给今天留一点空间'}</div><h2 id="nextTitle">${activity ? utils.e(activity.title) : tasks.length ? '今天也可以到这里。' : '选一件有点意思的小事。'}</h2>
    ${activity ? `<div class="step-detail"><span class="tag">约 ${activity.minutes} 分钟</span><span>${config.categories[activity.category]?.[1] || config.categories.care[1]}</span></div><p class="first-step"><span>只需先做</span>${utils.e(activity.step || activity.title)}</p><div class="hero-actions"><button class="btn btn-primary" data-action="start" data-id="${utils.e(activity.id)}">开始这一步 →</button><button class="btn btn-white" data-action="shrink" data-id="${utils.e(activity.id)}">再缩小一点</button>${pending.length > 1 ? '<button class="btn btn-text" data-action="nextSuggestion">换一件</button>' : ''}</div>` :
            tasks.length ? `<p>已经做的值得被看见，暂缓的也可以以后调整。</p><button class="btn btn-white" data-action="add">＋ 再安排一件小事</button>` :
                `<p>约 5 分钟，给自己一点体验。时长和内容都能调整。</p><div class="starter-options">${library.homePresets().map(p => library.presetCard(p, true)).join('')}</div><div class="home-library-actions"><button class="btn btn-text" data-action="homePresetNext">换一组 ↻</button><button class="btn btn-text" data-action="openLibrary">浏览全部 ${config.PRESETS.length} 项 →</button></div>`}
  </section>` : ''}
  <div class="cards"><div class="card"><div class="card-head"><div><h2>我的小步计划</h2><p class="small muted">${done ? '已记录 ' + done + ' 次行动 · ' : ''}${pending.length ? '还有 ' + pending.length + ' 件可以尝试' : '不必填满一天'}</p></div><button data-action="add" class="btn btn-soft" aria-label="增加活动">＋ 自己写一件</button></div>${components.taskList(state.selectedDate)}${tasks.length || !isToday ? '<div class="plan-inspiration"><button class="btn btn-text" data-action="openLibrary">从灵感里选 →</button></div>' : ''}</div>
    ${components.moodCard()}<div class="quiet-note card-wide"><span aria-hidden="true">🌱</span><p>今天没有做到，也可以调整。<br><span class="small muted">把步骤缩小、换个时间，或先好好休息。</span></p><button class="btn btn-text" data-page="guide">看看练习指南 →</button></div>
  </div>`;
    }

    function planPage() {
        const start = utils.dayAdd(state.selectedDate, -3), daynames = '日一二三四五六';
        const days = Array.from({ length: 7 }, (_, i) => utils.dayAdd(start, i));
        const [done, total] = activities.progress(state.selectedDate);
        return `<div class="section-intro"><div class="eyebrow">ACTIVITY SCHEDULING</div><h1>计划一点小行动</h1><p>从合理的小目标开始。建议一天先安排 1–3 件事，不必填满日程。</p></div><div class="card"><div class="card-head"><h2>选择日期</h2><div class="toolbar">${components.dateControls()}<button data-action="add" class="btn btn-primary">＋ 新活动</button></div></div><div class="week">${days.map(s => {
            let [d, t] = activities.progress(s);
            return `<button class="day ${s === state.selectedDate ? 'active' : ''}" data-action="chooseDay" data-date="${s}" aria-pressed="${s === state.selectedDate}"><small>周${daynames[utils.dateFrom(s).getDay()]}</small><b>${utils.dateFrom(s).getDate()}</b><div class="day-dot" style="opacity:${t ? 1 : .14}"></div></button>`;
        }).join('')}</div><div class="line"></div><div class="card-head"><div><h2>${utils.humanDate(state.selectedDate)}的计划</h2><p class="small muted">完成 ${done}/${total}</p></div><div style="width:110px" class="progress"><div style="width:${total ? 100 * done / total : 0}%"></div></div></div>${components.taskList(state.selectedDate)}</div>${library.activityLibrary()}`;
    }

    function moodChart() {
        const days = Array.from({ length: 14 }, (_, i) => utils.dayAdd(utils.localDate(), i - 13));
        const pts = days.map((s, i) => state.data.moods[s]?.mood == null ? null : { x: 35 + i * 29.6, y: 162 - state.data.moods[s].mood * 13.3, v: state.data.moods[s].mood, date: s });
        let circles = pts.filter(Boolean).map(p => `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#478b73"><title>${p.date}：${p.v}/10</title></circle>`).join('');
        let paths = '', segment = [];
        function flush() {
            if (segment.length)
                paths += `<path d="${segment.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ')}" fill="none" stroke="#478b73" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`;
            segment = [];
        }
        pts.forEach(p => p ? segment.push(p) : flush());
        flush();
        if (!pts.some(Boolean))
            return `<div class="empty">还没有情绪数据。<br><span class="small">记录几天后，这里会出现趋势。</span></div>`;
        return `<svg viewBox="0 0 460 206" role="img" aria-label="最近十四天的情绪评分曲线，满分十分">${[0, 5, 10].map(v => `<line x1="35" x2="426" y1="${162 - v * 13.3}" y2="${162 - v * 13.3}" stroke="#e9efeb" stroke-dasharray="4 4"/><text class="svg-label" x="11" y="${166 - v * 13.3}">${v}</text>`).join('')}${paths}${circles}${[0, 3, 6, 9, 13].map(i => `<text class="svg-label" x="${35 + i * 29.6}" y="190" text-anchor="middle">${utils.dateFrom(days[i]).getMonth() + 1}/${utils.dateFrom(days[i]).getDate()}</text>`).join('')}</svg>`;
    }

    function insightsPage() {
        const past7 = Array.from({ length: 7 }, (_, i) => utils.dayAdd(utils.localDate(), i - 6));
        const acts = state.data.activities.filter(x => past7.includes(x.date));
        const done = acts.filter(x => x.status === 'done');
        const tracked = past7.filter(s => state.data.moods[s]?.mood != null);
        const avg = tracked.length ? (tracked.reduce((sum, s) => sum + state.data.moods[s].mood, 0) / tracked.length).toFixed(1) : '—';
        const cd = Object.entries(config.categories).map(([id, [icon, name]]) => [icon, name, done.filter(x => x.category === id).length]).sort((a, b) => b[2] - a[2]);
        const reflections = [...done].filter(x => x.note).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
        return `<div class="section-intro"><div class="eyebrow">REFLECTION & PROGRESS</div><h1>回顾，而不是评判</h1><p>观察什么能带来帮助。情绪偶尔波动并不代表进步消失。</p></div><div class="metric-row"><div class="metric"><span>近 7 天完成</span><strong>${done.length}</strong><span>次小小的行动</span></div><div class="metric"><span>近 7 天平均心情</span><strong>${avg}</strong><span>共记录 ${tracked.length} 天</span></div><div class="metric"><span>留下的行动反馈</span><strong>${done.filter(x => x.pleasure != null || x.mastery != null || x.note).length}</strong><span>想写时再写就好</span></div></div>${repeatSuggestions(done)}<div class="cards"><div class="card card-wide"><div class="card-head"><div><h2>最近 14 天的情绪</h2><p class="muted small">没有记录的日期不会被自动补齐</p></div></div><div class="chartbox">${moodChart()}</div><div class="legend"><span><i></i>心情评分（0–10）</span><span>变化本来就不是直线</span></div></div><div class="card"><div class="card-head"><h2>行动的类型</h2></div>${cd.map(([icon, name, count]) => `<div style="margin:12px 0"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${icon} ${name}</span><strong>${count} 次</strong></div><div class="progress"><div style="width:${done.length ? count / done.length * 100 : 0}%"></div></div></div>`).join('')}<p class="status-note">有时，休息和社交比效率更值得优先安排。</p></div><div class="card"><div class="card-head"><h2>从行动中学到什么</h2></div>${reflections.length ? reflections.map(x => `<div style="padding:11px 0;border-bottom:1px solid var(--line)"><div class="small muted">${utils.e(x.date)} · ${utils.e(x.title)}</div><div style="font-size:13px;margin-top:6px">${utils.e(x.note)}</div></div>`).join('') : `<div class="empty">完成活动时可以留下短短一句感受。<br><span class="small">例如「没想象中困难」。</span></div>`}<div class="prompt">每周可以问自己：哪件事让我更接近重视的生活？哪些计划需要再缩小一点？</div></div></div>`;
    }

    function guidePage() {
        return `<div class="section-intro"><div class="eyebrow">YOUR GENTLE GUIDE</div><h1>行为激活练习指南</h1><p>重建与有意义的活动之间的联系，而不是逼迫自己「积极起来」。</p></div><div class="cards"><div class="card"><h2>最简单的使用方式</h2><ol class="steps" style="margin-top:20px"><li><strong>记录当下的心情</strong><p>用 0–10 分粗略标记即可，不需要找出原因。</p></li><li><strong>安排一项具体活动</strong><p>写明做什么、何时做、做多久，以及最小的第一步。</p></li><li><strong>行动后再观察</strong><p>记录愉悦感与成就感，允许两者都很低。</p></li><li><strong>每周温和回顾</strong><p>哪些活动有帮助？什么困难反复出现？据此调整。</p></li></ol></div><div class="card"><h2>如何区分休息与回避？</h2><p class="muted small" style="margin-top:10px">二者不是简单的好坏分类。可以试着问自己：</p><div class="prompt">「我正在有意识地补充精力，还是为了暂时不面对痛苦而不断推迟自己重视的事情？」</div><p class="small muted" style="margin-top:17px">真正的休息、游戏、娱乐、放空也可以是有价值的行为激活活动。</p><div class="line"></div><h3>如果今天没有做到</h3><p class="small muted" style="margin-top:7px">不必补偿，也不需要责备自己。把 30 分钟改成 5 分钟，或先准备好工具，就已经是有用的调整。</p></div><div class="card card-wide"><h2>应对「不想开始」的温和策略</h2><div class="guide-grid" style="margin-top:16px"><div class="guide-box"><h3>① 缩小步骤</h3><p>从「完成整章」变成「打开文件，看第一段」。</p><button data-action="quick" data-kind="two">试一个两分钟计划 →</button></div><div class="guide-box"><h3>② 提前规定情境</h3><p>「吃完午饭后，坐在桌前读 5 分钟」，通常比「找时间读书」更具体。</p><button data-action="add">写下具体计划 →</button></div><div class="guide-box"><h3>③ 让活动类别更均衡</h3><p>可以从照顾自己、兴趣、连接他人和学习探索中挑选。</p><button data-action="openLibrary">看看活动灵感 →</button></div><div class="guide-box"><h3>④ 注意长期意义</h3><p>一次行动可能没有立刻改善情绪，它仍然可能有价值。不要只以当下开心程度评判。</p><button data-page="insights">回顾行动反馈 →</button></div></div><div class="guide-note">这是辅助自助练习的工具，不是诊断或正式心理治疗的替代品。如果情绪问题持续、明显影响生活，或出现伤害自己的念头，请联系心理健康专业人员；有即时危险时联系所在地紧急服务。</div></div><div class="card card-wide"><div class="card-head"><div><h2>数据与隐私</h2><p class="muted small">记录默认只保存在当前浏览器的本地存储中，不上传服务器。</p></div></div><div class="settings-row"><div><strong>导出记录</strong><p>将活动和心情保存为 JSON 文件，便于备份或转移设备。</p></div><button class="btn btn-outline" data-action="export">导出 JSON</button></div><div class="settings-row"><div><strong>导入记录</strong><p>从之前导出的文件恢复；会替换当前浏览器已有记录。</p></div><button class="btn btn-outline" data-action="import">导入 JSON</button></div><div class="settings-row"><div><strong>清除记录</strong><p>仅清除此浏览器中保存的数据，此操作无法撤销。</p></div><button class="btn btn-outline" data-action="clear">清除全部</button></div><p class="status-note">注意：浏览器无痕模式或清除网站数据可能丢失记录。使用他人的设备时不建议输入私人内容。</p></div></div>`;
    }

    function repeatSuggestions(done) {
        const rated = done.filter(a => a.pleasure != null || a.mastery != null).sort((a, b) => Math.max(b.pleasure ?? -1, b.mastery ?? -1) - Math.max(a.pleasure ?? -1, a.mastery ?? -1)).slice(0, 3);
        return `<section class="card repeat-card"><div class="card-head"><div><h2>下次还想试试吗？</h2><p class="small muted">近 7 天中，评分相对较高的几次行动。只是你的记录，不代表因果。</p></div></div>${rated.length ? rated.map(a => `<div class="suggestion"><div><strong>${utils.e(a.title)}</strong><p>${components.feedbackSummary(a)} · ${utils.e(a.date)}</p></div><button class="mini" data-action="repeat" data-id="${utils.e(a.id)}">再次安排</button></div>`).join('') : '<p class="muted small">有空时给完成的活动补充一点感受，之后可以在这里挑选想再做的事。</p>'}</section>`;
    }

    function render() {
        components.nav();
        utils.$('#dateChip').textContent = components.dateHeading();
        utils.$('#view').innerHTML = ({ today: todayPage, plan: planPage, insights: insightsPage, guide: guidePage }[state.page])();
    }

    function renderPreservingPosition(focusSelector) {
        const top = window.scrollY || 0, left = window.scrollX || 0;
        render();
        if (focusSelector)
            (utils.$(focusSelector) || utils.$('#content')).focus({ preventScroll: true });
        window.scrollTo({ top, left, behavior: 'instant' });
    }

    function openLibrary() {
        storage.rememberMood();
        state.page = 'plan';
        render();
        utils.$('#libraryTitle').focus({ preventScroll: true });
        utils.$('#activityLibrary').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function viewPreset(id) {
        const activity = state.data.activities.find(a => a.id === id);
        if (!activity)
            return;
        storage.rememberMood();
        state.selectedDate = activity.date;
        state.page = 'plan';
        render();
        const task = utils.$(`[data-task-id="${CSS.escape(id)}"]`);
        task?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        task?.querySelector('[data-action="edit"]')?.focus({ preventScroll: true });
    }

    function setPage(p) {
        storage.rememberMood();
        state.page = p;
        render();
        utils.$('#content').focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function changeDate(date) {
        storage.rememberMood();
        state.selectedDate = date;
        state.recommendationId = null;
        render();
    }

    Object.assign(App.pages, {
        todayPage, planPage, moodChart, insightsPage, guidePage, repeatSuggestions, render, renderPreservingPosition, openLibrary, viewPreset, setPage, changeDate
    });
})(window.Weiguang);
