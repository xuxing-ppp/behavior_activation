// 活动编辑、开始、缩小、反馈和暂缓弹窗及焦点管理。
(function (App) {
    'use strict';
    const { components, config, state, utils } = App;

    function openModal(content) {
        utils.$('#snack').style.display = 'none';
        if (!utils.$('#modalLayer'))
            state.modalReturn = document.activeElement;
        utils.$('#modalRoot').innerHTML = `<div class="modal-layer" id="modalLayer"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" tabindex="-1">${content}</div></div>`;
        utils.$('#modalRoot h2').id = 'dialogTitle';
        utils.$('.shell').inert = true;
        utils.$('#mobNav').inert = true;
        document.body.style.overflow = 'hidden';
        utils.$('#modalRoot .close')?.focus();
    }

    function restoreFocus() {
        if (state.modalReturn?.isConnected)
            state.modalReturn.focus({ preventScroll: true });
        else
            utils.$('#content').focus({ preventScroll: true });
        state.modalReturn = null;
    }

    function closeModal() {
        if (!utils.$('#modalLayer'))
            return;
        utils.$('#modalRoot').innerHTML = '';
        utils.$('.shell').inert = false;
        utils.$('#mobNav').inert = false;
        document.body.style.overflow = '';
        restoreFocus();
    }

    function startModal(id) {
        const a = state.data.activities.find(x => x.id === id);
        if (!a || a.status || a.date !== utils.localDate())
            return;
        openModal(`<div class="modal-title"><h2>现在，只做这一件</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><div class="focus-step"><span class="tag">约 ${utils.e(a.minutes)} 分钟 · 按自己的节奏</span><h3>${utils.e(a.title)}</h3><p class="muted small">最小的第一步</p><p class="focus-first">${utils.e(a.step || a.title)}</p>${a.why ? `<p class="small muted">对我的意义：${utils.e(a.why)}</p>` : ''}</div><p class="small muted">从这一步开始就好，随时可以停下来调整。</p><div class="foot-actions"><button class="btn btn-outline" data-action="skip" data-id="${utils.e(id)}">先放一放</button><button class="btn btn-soft" data-action="shrink" data-id="${utils.e(id)}">调整一下</button><button class="btn btn-primary" data-action="complete" data-id="${utils.e(id)}">做到了 ✓</button></div>`);
    }

    function shrinkModal(id) {
        const a = state.data.activities.find(x => x.id === id);
        if (!a)
            return;
        openModal(`<div class="modal-title"><h2>小到愿意开始就好</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><p class="small muted">${utils.e(a.title)} · 只调整这条计划，不会多加一件。</p><form id="shrinkForm"><input type="hidden" name="id" value="${utils.e(id)}"><div class="field"><label for="smallStep">只做哪一小步？</label><input id="smallStep" name="step" maxlength="130" required value="${utils.e(a.step || '')}" placeholder="如：拿出书，翻开一页"></div><div class="field"><label for="smallMinutes">给它几分钟？</label><div class="toolbar">${[2, 5, 10].map(n => `<button type="button" class="pill" data-action="duration" data-min="${n}" aria-pressed="${a.minutes === n}">${n} 分钟</button>`).join('')}</div><input id="smallMinutes" name="minutes" type="number" min="1" max="1440" required value="${Math.min(a.minutes, 5)}"></div><div class="foot-actions"><button type="button" class="btn btn-outline" data-action="close">取消</button><button class="btn btn-primary" type="submit">保存这一小步</button></div></form>`);
        syncDuration();
        utils.$('#smallStep').focus();
    }

    function activityModal(id = null, proposal = null) {
        const a = state.data.activities.find(a => a.id === id) || proposal || {};
        const isEdit = !!id;
        openModal(`<div class="modal-title"><h2>${isEdit ? '调整这个计划' : '安排一件小事'}</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><p class="small muted">从你现在能做到的版本开始。把困难的事拆小一点。</p><form id="activityForm"><input type="hidden" name="id" value="${utils.e(id || '')}"><input type="hidden" name="presetId" value="${utils.e(a.presetId || '')}"><div class="field"><label for="actTitle">我准备做什么？ *</label><input id="actTitle" name="title" maxlength="90" required placeholder="如：打开论文，读 1 页" value="${utils.e(a.title || '')}"></div><div class="split"><div class="field"><label for="actDate">哪一天</label><input type="date" id="actDate" name="date" required value="${utils.e(a.date || state.selectedDate)}"></div><div class="field"><label for="actTime">大概几点（选填）</label><input type="time" id="actTime" name="time" value="${utils.e(a.time || '')}"></div></div><div class="split"><div class="field"><label for="actDuration">大约几分钟</label><input id="actDuration" type="number" name="minutes" min="1" max="1440" required value="${utils.e(a.minutes || 5)}"></div><div class="field"><label for="actCategory">活动类别</label><select id="actCategory" name="category">${Object.entries(config.categories).map(([k, [icon, name]]) => `<option value="${k}" ${a.category === k ? 'selected' : ''}>${icon} ${name}</option>`).join('')}</select></div></div><div class="field"><label for="actStep">最小的第一步（可选）</label><input id="actStep" maxlength="130" name="step" placeholder="如：只打开 PDF 文件" value="${utils.e(a.step || '')}"></div><div class="field"><label for="actWhy">它对我有什么意义？（可选）</label><input id="actWhy" maxlength="150" name="why" placeholder="如：我希望继续保持对学习的好奇" value="${utils.e(a.why || '')}"></div><div class="foot-actions">${isEdit ? '<button type="button" class="btn btn-outline" data-action="delete" data-id="' + utils.e(id) + '" style="margin-right:auto;color:#ac6058">删除</button>' : ''}<button type="button" data-action="close" class="btn btn-outline">取消</button><button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '加入计划'}</button></div></form>${isEdit ? `<div class="line"></div><div class="toolbar">${a.status === 'done' ? `<button class="btn btn-soft" data-action="feedback" data-id="${utils.e(id)}">补充感受</button>` : `<button class="btn btn-soft" data-action="complete" data-id="${utils.e(id)}">做到了</button>`}<button class="btn btn-soft" data-action="skip" data-id="${utils.e(id)}">今天先不做</button>${a.status ? `<button class="btn btn-text" data-action="reset" data-id="${utils.e(id)}">恢复为待完成</button>` : ''}</div>` : ''}`);
        utils.$('#actTitle').focus();
    }

    function completionModal(id) {
        const a = state.data.activities.find(x => x.id === id);
        if (!a || a.status !== 'done')
            return;
        openModal(`<div class="modal-title"><h2>留一点行动后的感受</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><p><strong>${utils.e(a.title)}</strong></p><p class="muted small">已经记录完成，下面都可以不填。</p><form id="completeForm"><input name="id" value="${utils.e(id)}" type="hidden">${[['pleasure', '愉悦感', '0 没有愉悦 · 10 非常愉悦'], ['mastery', '成就感／掌控感', '0 没有成就感 · 10 很有成就感']].map(([key, label, hint]) => `<div class="field"><label>${label}（选填）</label><p class="tiny muted">${hint}</p><input type="hidden" name="${key}" value="${a[key] ?? ''}">${components.ratingButtons(a[key] ?? null, key)}<button type="button" class="btn btn-text clear-rating" data-action="clearRating" data-kind="${key}">清除这项评分</button></div>`).join('')}<div class="field"><label for="finishNote">这次有什么发现？（选填）</label><textarea name="note" id="finishNote" maxlength="700" placeholder="例如：刚开始有点难，做了一点之后没那么抗拒">${utils.e(a.note || '')}</textarea></div><div class="foot-actions"><button type="button" class="btn btn-outline" data-action="close">先不写</button><button type="submit" class="btn btn-primary">保存感受</button></div></form>`);
    }

    function skipModal(id) {
        const a = state.data.activities.find(x => x.id === id);
        if (!a)
            return;
        openModal(`<div class="modal-title"><h2>给计划留一点余地</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><p><strong>${utils.e(a.title)}</strong></p><p class="small muted">可以先放下，也可以换个时间、再缩小一点。</p><form id="skipForm"><input name="id" type="hidden" value="${utils.e(id)}"><div class="field"><label for="skipReason">遇到了什么？（选填）</label><select name="reason" id="skipReason">${['', '任务太大，难以开始', '精力不足，需要休息', '时间或环境不合适', '临时有更重要的事情', '其他原因'].map(x => `<option value="${x}" ${a.skipReason === x ? 'selected' : ''}>${x || '不记录原因'}</option>`).join('')}</select></div><div class="foot-actions"><button type="button" class="btn btn-outline" data-action="shrink" data-id="${utils.e(id)}">再调整一下</button><button class="btn btn-soft" type="submit" name="decision" value="tomorrow">改到明天</button><button class="btn btn-primary" type="submit" name="decision" value="skip">先暂缓</button></div></form>`);
    }

    function syncDuration() {
        document.querySelectorAll('[data-action="duration"]').forEach(b => {
            const on = Number(b.dataset.min) === Number(utils.$('#smallMinutes').value);
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on);
        });
    }

    Object.assign(App.dialogs, {
        openModal, restoreFocus, closeModal, startModal, shrinkModal, activityModal, completionModal, skipModal, syncDuration
    });
})(window.Weiguang);
