// 应用配置、导航和活动预设；共享状态仅在页面会话中存在。
window.Weiguang = {
    config: {},
    state: {
        data: null, page: 'today', selectedDate: null, recommendationId: null, modalReturn: null, undoRecord: null, moodDrafts: new Map(), libraryState: { category: 'all', shortOnly: false, limit: 6 }, homePresetOffset: 0
    },
    utils: {},
    storage: {},
    components: {},
    library: {},
    pages: {},
    dialogs: {},
    activities: {},
    backup: {},
    sync: {},
    events: {}
};
(function (App) {
    'use strict';
    const KEY = 'weiguang-ba-v1';
    const categories = {
        care: ['🌿', '照顾自己'], move: ['🚶', '身体活动'], connect: ['💬', '人际连接'], progress: ['📖', '学习与探索'], joy: ['🎨', '兴趣与愉悦']
    };
    const defaults = { activities: [], moods: {}, version: 1 };
    const tabs = [['today', '⌂', '今天'], ['plan', '▦', '安排'], ['insights', '◷', '回顾'], ['guide', '♡', '指南']];
    const PRESETS = Object.freeze([
        ['care-drink', 'care', '泡一杯喜欢的饮品，坐下来慢慢喝', 5, '选一种今天想喝的饮品'],
        ['care-snack', 'care', '给自己准备一份水果或点心', 10, '看看有什么想吃、容易准备的食物'],
        ['care-corner', 'care', '把桌边的一小片地方收拾舒服', 10, '选定今天只整理的那一小片'],
        ['care-shower', 'care', '洗个澡，换上舒服的衣服', 15, '先拿好毛巾和换洗衣服'],
        ['care-meal', 'care', '安静吃一份简单的早餐或简餐', 15, '选一份容易准备或买到的食物'],
        ['care-new-snack', 'care', '给自己挑一种和平时不同的小吃', 10, '想想附近或食堂里有什么想尝试的食物'],
        ['move-stretch', 'move', '跟一段轻柔的拉伸视频活动身体', 5, '找一段短视频，腾出一点空间'],
        ['move-route', 'move', '换条熟悉的路线在校园里走走', 10, '选一个和平时稍有不同的方向'],
        ['move-outside', 'move', '到楼外散步，看看周围有什么变化', 5, '穿好鞋，走到楼外'],
        ['move-music', 'move', '放一首节奏喜欢的歌，随意活动身体', 5, '选一首让自己想动一动的歌'],
        ['move-cycle', 'move', '骑车绕校园一小圈', 15, '选一条熟悉、方便返回的短路线'],
        ['move-discover', 'move', '去校园里一处平时少去的地方看看', 10, '选一个不远、方便返回的地方'],
        ['connect-share', 'connect', '给朋友分享一件最近遇到的小事', 5, '选一个想分享的人和一件小事'],
        ['connect-peer', 'connect', '和同门聊聊最近看的书、剧或游戏', 10, '找一个彼此都方便的时机'],
        ['connect-invite', 'connect', '邀请熟悉的人一起吃饭或散步', 5, '想一个自己也方便的时间'],
        ['connect-call', 'connect', '和一位熟悉的人打个简短电话', 10, '先问问对方是否方便'],
        ['connect-voice', 'connect', '给朋友留一段近况语音', 5, '想想最近最愿意讲的一件事'],
        ['connect-recommend', 'connect', '给朋友推荐一本书、一首歌或一部剧', 5, '想一件最近喜欢、愿意分享的作品'],
        ['explore-book', 'progress', '读几页课题之外、自己想读的书', 10, '选一本现在有兴趣翻开的书'],
        ['explore-video', 'progress', '看一段感兴趣的科普短视频', 10, '选一个此刻好奇的话题'],
        ['explore-question', 'progress', '查一查生活中冒出的一个小问题', 5, '把那个问题写进搜索框'],
        ['explore-map', 'progress', '在地图上逛一个没去过的地方', 10, '搜一个好奇的城市，放大看看街道或地形'],
        ['explore-events', 'progress', '看看近期讲座、展览或校园活动', 5, '打开一个常用的活动信息入口'],
        ['explore-podcast', 'progress', '听一小段课题之外的播客', 10, '选一个标题让自己有兴趣的单集'],
        ['joy-songs', 'joy', '听两首没听过的歌，挑一首喜欢的', 10, '打开一个感兴趣的歌单'],
        ['joy-draw', 'joy', '随手画一个身边的小物件', 10, '选一个杯子、植物或其他小物件'],
        ['joy-photo', 'joy', '在附近找一个有意思的画面拍下来', 10, '带上手机，看看周围'],
        ['joy-play', 'joy', '玩一小段喜欢的游戏或拼图', 15, '选一个适合短暂体验的关卡或玩法'],
        ['joy-album', 'joy', '翻看喜欢的照片，重温一段经历', 5, '打开一个想重看的相册'],
        ['joy-outdoors', 'joy', '在室外坐一会儿，看看周围的人和景物', 10, '在附近找一个自己愿意坐下的位置']
    ].map(([id, category, title, minutes, step]) => Object.freeze({ id, category, title, minutes, step })));
    const PRESET_BY_ID = new Map(PRESETS.map(p => [p.id, p]));

    Object.assign(App.config, { KEY, categories, defaults, tabs, PRESETS, PRESET_BY_ID });
})(window.Weiguang);
