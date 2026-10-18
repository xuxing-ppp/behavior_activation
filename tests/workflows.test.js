// Run with: node tests/workflows.test.js
// Exercises the real inline application logic with a minimal document adapter.
// Browser layout, focus trapping and native form behavior need browser verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const key = 'weiguang-ba-v1';

function setup(seed) {
  const nodes = new Map(), events = {}, storage = new Map();
  let failWrites = false, noteVisible = false;
  if (seed) storage.set(key, JSON.stringify(seed));
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      style: {}, value: '', textContent: '', innerHTML: '', dataset: {},
      focus() {}, appendChild() {}, addEventListener(type, fn) { events[selector + ':' + type] = fn; },
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
    window: { scrollTo() {} },
    FormData: class { constructor(form) { this.values = form.values; } get(name) { return this.values[name] ?? null; } },
    localStorage: {
      getItem: name => storage.get(name) ?? null,
      setItem(name, value) { if (failWrites) throw new Error('quota'); storage.set(name, value); },
    },
  });
  const expose = `globalThis.app={localDate,dayAdd,todayPage,insightsPage,handleClick,submit,completeActivity,changeDate,setPage,render,
    get data(){return data},get selectedDate(){return selectedDate},get drafts(){return moodDrafts}};`;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, expose + '})();'), context);
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

test('empty home offers three editable actions; all four pages render', () => {
  const h = setup();
  assert.equal((h.app.todayPage().match(/class="starter"/g) || []).length, 3);
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
  console.log(`${count+1} workflow checks passed`);
})().catch(error => { console.error(error);process.exitCode=1; });
