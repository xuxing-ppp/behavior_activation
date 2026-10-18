// 启动入口：所有模块加载完毕后读取记录、绑定事件并渲染。
(function (App) {
    'use strict';
    const { state, utils, storage, pages, backup, events } = App;
    state.data = storage.load();
    state.selectedDate = utils.localDate();
    utils.$('#importFile').addEventListener('change', backup.importData);
    document.addEventListener('click', events.handleClick);
    document.addEventListener('submit', events.submit);
    document.addEventListener('input', events.handleInput);
    document.addEventListener('keydown', events.handleKeydown);
    document.addEventListener('click', events.handleBackdropClick);
    pages.render();
})(window.Weiguang);
