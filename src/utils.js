// 日期、文本转义、标识生成和 DOM 查询等通用工具。
(function (App) {
    'use strict';
    const $ = selector => document.querySelector(selector);

    function localDate(dt = new Date()) {
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    }

    function dateFrom(s) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d, 12);
    }

    function dayAdd(s, n) {
        let d = dateFrom(s);
        d.setDate(d.getDate() + n);
        return localDate(d);
    }

    function dayDiff(a, b) {
        return Math.round((dateFrom(a) - dateFrom(b)) / 86400000);
    }

    function humanDate(s) {
        const d = dateFrom(s);
        return (s === localDate() ? '今天 · ' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    function e(x) {
        return String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function uid() {
        return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function isDate(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(dateFrom(value)) === value;
    }

    Object.assign(App.utils, { localDate, dateFrom, dayAdd, dayDiff, humanDate, e, uid, isDate, $ });
})(window.Weiguang);
