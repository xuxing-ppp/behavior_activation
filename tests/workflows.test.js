// Run with: node tests/workflows.test.js
// Loads the actual browser scripts in index.html order with a minimal document adapter.
// Browser layout, focus trapping and native form behavior need browser verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const scripts = scriptTags.map(([, attributes, inline]) => {
  const src = attributes.match(/\bsrc="([^"]+)"/)?.[1];
  assert.ok(src && !inline.trim(), 'Application scripts must be external');
  assert.match(attributes, /\bdefer\b/, 'Keep browser execution in document order');
  const filename = path.resolve(__dirname, '..', src);
  return { src, filename, source: fs.readFileSync(filename, 'utf8') };
});
const key = 'weiguang-ba-v1';

function setup(seed) {
  const nodes = new Map(), events = {}, storage = new Map();
  let failWrites = false, noteVisible = false;
  if (seed) storage.set(key, JSON.stringify(seed));
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      style: {}, value: '', textContent: '', innerHTML: '', dataset: {},
      focus() {}, scrollIntoView() {}, querySelector() { return node("child"); }, appendChild() {}, addEventListener(type, fn) { events[selector + ':' + type] = fn; },
    });
    return nodes.get(selector);
  };
  const document = {
    body: node('body'), activeElement: node('active'),
    querySelector: selector => selector === '#moodNote' && !noteVisible ? null : node(selector),
    querySelectorAll: () => [], createElement: () => node('created'),
    addEventListener(type, fn) { events[type] = fn; },
  };
  const context = vm.createContext({
    document, structuredClone, console, Date, Math, Map, Object, JSON, Number, String,
    setTimeout: () => 1, clearTimeout() {}, confirm: () => true,
    window: { scrollX:0, scrollY:0, scrollTo() {} },
    CSS: { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, "_") },
    FormData: class { constructor(form) { this.values = form.values; } get(name) { return this.values[name] ?? null; } },
    localStorage: {
      getItem: name => storage.get(name) ?? null,
      setItem(name, value) { if (failWrites) throw new Error('quota'); storage.set(name, value); },
    },
  });
  for (const { filename, source } of scripts) {
    vm.runInContext(source, context, { filename });
  }
  const modules = context.window.Weiguang;
  const state = modules.state;
  context.app = {
    ...modules.utils, ...modules.components, ...modules.library,
    ...modules.pages, ...modules.dialogs, ...modules.activities, ...modules.events,
    PRESETS: modules.config.PRESETS,
    categories: modules.config.categories,
    libraryState: state.libraryState,
    get data() { return state.data; },
    get selectedDate() { return state.selectedDate; },
    get drafts() { return state.moodDrafts; },
  };
  return {
    app: context.app, node, storage, events,
    fail(value) { failWrites = value; },
    moodInput(value) { noteVisible = true; node('#moodNote').value = value; },
    hideMoodInput() { noteVisible = false; },
    click(action, dataset = {}) {
      const button = { dataset: { action, ...dataset } };
      context.app.handleClick({ target: { closest: () => button } });
    },
    form(id, values, decision) {
      context.app.submit({ target: { id: { value: values.id }, getAttribute: name => name === 'id' ? id : null, values }, preventDefault() {}, submitter: { value: decision } });
    },
  };
}
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
const activity = (id, extra = {}) => ({ id, title: 'Read a page', date: today, minutes: 5, category: 'progress', status: '', created: 1, ...extra });
const seed = activities => ({ version: 1, activities, moods: {} });
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }

test('HTML loads categorized scripts and stylesheet with a single startup entry', () => {
  assert.ok(scripts.length > 1);
  assert.equal(new Set(scripts.map(s => s.src)).size,scripts.length);
  assert.equal(scripts[0].src,'src/config.js');
  assert.equal(scripts.at(-1).src,'src/app.js');
  assert.ok(scripts.every(s => s.src.startsWith('src/')));
  assert.doesNotMatch(html,/<style\b/i);
  const stylesheet=html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
  assert.ok(stylesheet && fs.existsSync(path.resolve(__dirname,'..',stylesheet)));
  const h=setup();
  assert.ok(h.events.click && h.events.submit && h.events['#importFile:change']);
});

test('empty home offers three preset activities; all four pages render', () => {
  const h = setup();
  assert.equal((h.app.todayPage().match(/data-preset-card=/g) || []).length, 3);
  for (const page of ['today', 'plan', 'insights', 'guide']) h.app.setPage(page);
});
test('next action follows planned time; changing suggestion preserves status', () => {
  const h = setup(seed([activity('late', {time:'15:00'}), activity('early', {time:'09:00',title:'Early'})]));
  assert.match(h.app.todayPage(), /id="nextTitle">Early/);
  h.click('nextSuggestion');
  assert.match(h.app.todayPage(), /id="nextTitle">Read a page/);
  assert.ok(h.app.data.activities.every(a => a.status === ''));
});
test('one-click completion does not invent ratings and undo restores original', () => {
  const h = setup(seed([activity('a')]));
  h.click('complete', { id: 'a' });
  assert.equal(h.app.data.activities[0].status, 'done');
  assert.equal(h.app.data.activities[0].pleasure, undefined);
  assert.equal(h.app.data.activities[0].mastery, undefined);
  assert.equal(JSON.parse(h.storage.get(key)).activities[0].status, 'done');
  h.click('undo', { id: 'a' });
  assert.equal(h.app.data.activities[0].status, '');
});
test('shrinking changes original; rescheduling moves original to tomorrow', () => {
  const h = setup(seed([activity('a')]));
  h.form('shrinkForm', {id:'a',step:'Open the book',minutes:'2'});
  assert.equal(h.app.data.activities.length, 1);
  assert.equal(h.app.data.activities[0].step, 'Open the book');
  assert.equal(h.app.data.activities[0].minutes, 2);
  h.form('skipForm', {id:'a',reason:'Too tired'}, 'tomorrow');
  assert.equal(h.app.data.activities.length, 1);
  assert.equal(h.app.data.activities[0].date, h.app.dayAdd(today, 1));
  assert.equal(h.app.data.activities[0].status, '');
  assert.doesNotMatch(h.app.todayPage(), /data-action="start"/);
});
test('skip can be reset by saving a smaller step without duplicate records', () => {
  const h = setup(seed([activity('a')]));
  h.form('skipForm', {id:'a',reason:'Need rest'}, 'skip');
  assert.equal(h.app.data.activities[0].status, 'skipped');
  assert.equal(h.app.data.activities[0].skipReason, 'Need rest');
  h.form('shrinkForm', {id:'a',step:'Take out the book',minutes:'1'});
  assert.equal(h.app.data.activities[0].status, '');
  assert.equal(h.app.data.activities[0].skipReason, undefined);
});
test('optional ratings preserve zero, omit empty scores, and drive review', () => {
  const h = setup(seed([activity('a',{status:'done'})]));
  h.form('completeForm', {id:'a',pleasure:'0',mastery:'',note:'A small start'});
  const a = h.app.data.activities[0];
  assert.equal(a.pleasure, 0);
  assert.equal(a.mastery, undefined);
  assert.ok(a.feedbackAt);
  assert.match(h.app.insightsPage(), /愉悦 0\/10/);
  assert.doesNotMatch(h.app.insightsPage(), /成就 0\/10|尝试率/);
  h.form('completeForm', {id:'a',pleasure:'',mastery:'',note:''});
  assert.equal(h.app.data.activities[0].pleasure, undefined);
});
test('mood drafts survive navigation and remain isolated by date', () => {
  const h = setup();
  h.moodInput('Today draft');
  h.click(undefined, {rate:'mood',score:'0'});
  h.app.setPage('plan');
  h.hideMoodInput();
  const yesterday = h.app.dayAdd(today,-1);
  h.app.changeDate(yesterday);
  h.moodInput('Yesterday draft');
  h.click(undefined, {rate:'mood',score:'4'});
  h.app.changeDate(today);
  h.hideMoodInput();
  assert.equal(h.app.drafts.get(today).note, 'Today draft');
  assert.equal(h.app.drafts.get(today).mood, 0);
  assert.equal(h.app.drafts.get(yesterday).note, 'Yesterday draft');
  h.moodInput('Today draft');
  h.click('saveMood');
  assert.equal(h.app.data.moods[today].mood, 0);
  assert.equal(h.app.drafts.has(today), false);
  assert.equal(h.app.drafts.has(yesterday), true);
});
test('saving an activity on another date cannot move mood draft to that date', () => {
  const h = setup();
  h.moodInput('Only today');
  const tomorrow = h.app.dayAdd(today,1);
  h.form('activityForm', {title:'Tomorrow walk',date:tomorrow,minutes:'5',category:'move'});
  assert.equal(h.app.selectedDate,tomorrow);
  assert.equal(h.app.drafts.get(today).note,'Only today');
  assert.equal(h.app.drafts.has(tomorrow),false);
  assert.doesNotMatch(h.app.todayPage(), /data-action="start"/);
});
test('storage failure keeps saved state and form input; retry succeeds', () => {
  const h = setup(seed([activity('a')]));
  const before = h.storage.get(key);
  h.fail(true);
  h.click('complete',{id:'a'});
  assert.equal(h.app.data.activities[0].status,'');
  assert.equal(h.storage.get(key),before);
  assert.match(h.node('#snack').textContent,/尚未保存/);
  h.form('shrinkForm',{id:'a',step:'Open book',minutes:'2'});
  assert.equal(h.app.data.activities[0].minutes,5);
  h.moodInput('Do not lose this');
  h.click(undefined,{rate:'mood',score:'3'});
  h.click('saveMood');
  assert.equal(h.app.data.moods[today],undefined);
  assert.equal(h.app.drafts.get(today).note,'Do not lose this');
  h.fail(false);
  h.click('saveMood');
  assert.equal(h.app.data.moods[today].note,'Do not lose this');
});
test('old data, missing ratings, zero ratings and escaped titles render safely', () => {
  const h = setup(seed([activity('old',{status:'done',pleasure:0}),activity('x',{title:'<img onerror=alert(1)>'})]));
  assert.match(h.app.todayPage(),/&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(h.app.todayPage(),/成就 undefined/);
  assert.match(h.app.insightsPage(),/愉悦 0\/10/);
});
test('catalog contains six concrete experiences per category, all with first steps', () => {
  const { app } = setup();
  assert.equal(app.PRESETS.length,30);
  assert.equal(new Set(app.PRESETS.map(p=>p.id)).size,30);
  for(const category of Object.keys(app.categories)) {
    const presets = app.PRESETS.filter(p=>p.category===category);
    assert.equal(presets.length,6);
    for(const preset of presets) {
      assert.ok(preset.title && preset.step);
      assert.ok([5,10,15].includes(preset.minutes));
      assert.ok(Object.isFrozen(preset));
    }
  }
  assert.equal(app.categories.progress[1],'学习与探索');
});
test('home suggestions are light, stable across renders and rotate only on request', () => {
  const h = setup();
  const ids = () => Array.from(h.app.homePresets(),p=>p.id);
  assert.deepEqual(ids(),['care-drink','move-outside','joy-album']);
  assert.ok(h.app.homePresets().every(p=>p.minutes<=5));
  h.app.render();
  assert.deepEqual(ids(),['care-drink','move-outside','joy-album']);
  h.click('homePresetNext');
  assert.notDeepEqual(ids(),['care-drink','move-outside','joy-album']);
  assert.equal(h.app.data.activities.length,0);
});
test('library filters and pagination show distinct results and reset the page size', () => {
  const h = setup();
  const cards = () => (h.app.activityLibrary().match(/data-preset-card=/g)||[]).length;
  assert.equal(cards(),6);
  assert.deepEqual(Array.from(h.app.filteredPresets().slice(0,5),p=>p.category),['care','move','connect','progress','joy']);
  for(const count of [12,18,24,30]) {h.click('presetMore');assert.equal(cards(),count);}
  assert.equal(new Set(h.app.filteredPresets().map(p=>p.id)).size,30);
  h.click('presetCategory',{category:'move'});
  assert.equal(cards(),6);
  assert.equal(h.app.libraryState.limit,6);
  h.click('presetShort');
  assert.equal(cards(),3);
  assert.ok(h.app.filteredPresets().every(p=>p.minutes<=5&&p.category==='move'));
  h.click('presetCategory',{category:'all'});
  assert.equal(cards(),6);
  assert.equal(h.app.filteredPresets().length,11);
  assert.equal(h.app.data.activities.length,0);
});
test('one-click presets honor the selected date and reject rapid duplicate adds', () => {
  const h = setup();
  const tomorrow=h.app.dayAdd(today,1);
  h.app.changeDate(tomorrow);
  h.click('presetAdd',{presetId:'care-drink'});
  const added=h.app.data.activities[0];
  assert.equal(added.date,tomorrow);
  assert.equal(added.presetId,'care-drink');
  assert.equal(added.minutes,5);
  assert.equal(added.step,'选一种今天想喝的饮品');
  assert.equal(added.status,'');
  assert.equal(added.why,'');
  assert.equal(added.time,'');
  h.click('presetAdd',{presetId:'care-drink'});
  assert.equal(h.app.data.activities.length,1);
  assert.match(h.app.activityLibrary(),/查看计划/);
  h.app.changeDate(today);
  h.click('presetAdd',{presetId:'care-drink'});
  assert.equal(h.app.data.activities.length,2);
});
test('done and skipped presets remain identifiable even after an activity is renamed', () => {
  for(const status of ['done','skipped']) {
    const h=setup(seed([activity('a',{presetId:'care-drink',status,title:'My own drink'})]));
    h.click('presetAdd',{presetId:'care-drink'});
    assert.equal(h.app.data.activities.length,1);
    assert.match(h.app.activityLibrary(),status==='done'?/已完成/:/已暂缓/);
  }
});
test('preset undo removes only the new activity and subsequent writes invalidate undo', () => {
  const h=setup(seed([activity('existing')]));
  h.click('presetAdd',{presetId:'care-drink'});
  const id=h.app.data.activities[1].id;
  h.click('undo',{id});
  assert.equal(h.app.data.activities.length,1);
  assert.equal(h.app.data.activities[0].id,'existing');
  h.click('presetAdd',{presetId:'care-drink'});
  const newer=h.app.data.activities[1].id;
  h.moodInput('Keep this');h.click(undefined,{rate:'mood',score:'5'});h.click('saveMood');
  h.click('undo',{id:newer});
  assert.equal(h.app.data.activities.length,2);
});
test('failed preset add leaves saved records and card state intact; retry can be undone', () => {
  const h=setup();h.fail(true);
  h.click('presetAdd',{presetId:'care-drink'});
  assert.equal(h.app.data.activities.length,0);
  assert.equal(h.storage.has(key),false);
  assert.doesNotMatch(h.app.activityLibrary(),/data-action="presetView"/);
  assert.match(h.node('#snack').textContent,/尚未保存/);
  h.fail(false);h.click('presetAdd',{presetId:'care-drink'});
  assert.equal(h.app.data.activities.length,1);
  h.click('undo',{id:h.app.data.activities[0].id});
  assert.equal(h.app.data.activities.length,0);
});
test('adjusted preset preserves identity, accepts a different date and cannot change its template', () => {
  const h=setup();const preset=h.app.PRESETS[0];
  h.click('presetCategory',{category:'care'});h.click('presetShort');
  h.click('presetAdjust',{presetId:preset.id});
  assert.match(h.node('#modalRoot').innerHTML,/name="presetId" value="care-drink"/);
  assert.match(h.node('#modalRoot').innerHTML,/选一种今天想喝的饮品/);
  h.click('close');
  assert.equal(h.app.libraryState.category,'care');
  assert.equal(h.app.libraryState.shortOnly,true);
  assert.equal(h.app.data.activities.length,0);
  const tomorrow=h.app.dayAdd(today,1);
  h.form('activityForm',{title:'泡一杯茶',date:tomorrow,minutes:'8',category:'care',step:'选茶包',presetId:preset.id});
  const a=h.app.data.activities[0];
  assert.equal(a.date,tomorrow);assert.equal(a.presetId,preset.id);assert.equal(a.minutes,8);
  assert.equal(preset.minutes,5);assert.equal(preset.title,'泡一杯喜欢的饮品，坐下来慢慢喝');
  h.form('activityForm',{title:'再泡一杯',date:tomorrow,minutes:'5',category:'care',presetId:preset.id});
  assert.equal(h.app.data.activities.length,1);
  assert.match(h.node('#snack').textContent,/已经安排过/);
});
test('moving a preset to tomorrow does not overwrite an existing plan', () => {
  const h=setup(seed([activity('a',{presetId:'care-drink'}),activity('b',{presetId:'care-drink',date:setup().app.dayAdd(today,1)})]));
  h.form('skipForm',{id:'a',reason:''},'tomorrow');
  assert.equal(h.app.data.activities[0].date,today);
  assert.equal(h.app.data.activities.length,2);
  assert.match(h.node('#snack').textContent,/明天已经安排/);
});
test('adding a preset retains unsaved mood input and historic progress category records', () => {
  const h=setup(seed([activity('old',{category:'progress'})]));
  h.moodInput('Still a draft');h.click(undefined,{rate:'mood',score:'4'});
  h.click('presetAdd',{presetId:'joy-album'});
  assert.equal(h.app.drafts.get(today).note,'Still a draft');
  assert.equal(h.app.drafts.get(today).mood,4);
  assert.equal(h.app.data.activities[0].category,'progress');
  assert.match(h.app.todayPage(),/学习与探索/);
});

(async () => {
  const h = setup(seed([activity('existing')]));
  const oldBackup = seed([activity('imported',{status:'done'})]);
  const input = { files:[{size:100,text:async()=>JSON.stringify(oldBackup)}],value:'file'};
  h.fail(true);
  await h.events['#importFile:change']({target:input});
  assert.equal(h.app.data.activities[0].id,'existing');
  h.fail(false);
  await h.events['#importFile:change']({target:input});
  assert.equal(h.app.data.activities[0].id,'imported');
  assert.equal(h.app.data.activities[0].pleasure,undefined);
  console.log('PASS old backup import is atomic and keeps missing ratings optional');
  const presets=setup();
  const imported=seed([
    activity('known',{presetId:'care-drink'}),
    activity('retired',{presetId:'retired-activity'}),
    activity('invalid',{presetId:'<script>'}),
    activity('old',{category:'progress'})
  ]);
  const backupInput={files:[{size:100,text:async()=>JSON.stringify(imported)}],value:'file'};
  await presets.events['#importFile:change']({target:backupInput});
  const restored=JSON.parse(presets.storage.get(key));
  assert.equal(restored.activities[0].presetId,'care-drink');
  assert.equal(restored.activities[1].presetId,'retired-activity');
  assert.equal(restored.activities[2].presetId,undefined);
  assert.equal(restored.activities[3].category,'progress');
  presets.click('presetAdd',{presetId:'care-drink'});
  assert.equal(presets.app.data.activities.length,4);
  console.log('PASS backup round-trip retains optional and retired preset identities');
  console.log(`${count+2} workflow checks passed`);
})().catch(error => { console.error(error);process.exitCode=1; });
