"""Run against python3 -m http.server 8000. Requires Playwright + Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8000/'
ARTIFACTS = Path(__file__).parent / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
MOCK = r"""
window.__cloud = null;
window.__offline = false;
window.__writes = 0;
window.supabase = {createClient: () => {
 let listener;
 return {
  auth: {
   onAuthStateChange(fn) { listener = fn; },
   async getSession() { return {data:{session:null}}; },
   async signInWithOAuth(options) {
    window.__loginOptions = options;
    listener('SIGNED_IN', {user:{id:'test-user',user_metadata:{user_name:'测试账号'}}}); return {};
   },
   async signOut() { listener('SIGNED_OUT', null); return {}; }
  },
  from() { return {select(){return this;},eq(){return this;},async maybeSingle(){
   if(window.__offline) throw Error('offline');
   return {data:structuredClone(window.__cloud)};
  }}; },
  async rpc(name,args) {
   if(window.__offline) throw Error('offline');
   if(args.expected_revision !== (window.__cloud?.revision || 0)) return {data:false};
   window.__cloud = {payload:structuredClone(args.new_payload),revision:(window.__cloud?.revision || 0)+1};
   window.__writes++; return {data:true};
  }
 };
}};
"""
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    errors = []
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    # Real SDK must construct provider-specific PKCE OAuth URLs for both buttons.
    for provider, label in [('github', 'GitHub'), ('google', 'Google')]:
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        page.wait_for_function('window.supabase && document.querySelector("#syncChip").textContent.includes("未登录")')
        page.locator('#syncChip').click()
        page.get_by_role('button', name=f'使用 {label} 登录').wait_for()
        if provider == 'github':
            page.screenshot(path=str(ARTIFACTS / 'sync-desktop.png'), full_page=True)
            with page.expect_download() as exported:
                page.get_by_role('button', name='导出 JSON', exact=True).click()
            assert exported.value.suggested_filename.endswith('.json')
        page.route('**/auth/v1/authorize**', lambda route: route.fulfill(status=200, content_type='text/html', body='OAuth redirect captured'))
        page.get_by_role('button', name=f'使用 {label} 登录').click()
        page.wait_for_url('**/auth/v1/authorize**')
        assert f'provider={provider}' in page.url and 'code_challenge=' in page.url
        assert 'redirect_to=http%3A%2F%2Flocalhost%3A8000%2F' in page.url
    page.close()
    # Simulated auth/transport, actual application controls, storage, rendering, and merge.
    page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script(MOCK)
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#syncChip').click()
    page.get_by_role('button', name='使用 Google 登录').click()
    assert page.evaluate('window.__loginOptions.provider') == 'google'
    page.get_by_role('button', name='开启自动同步').click()
    page.wait_for_function('window.__cloud !== null')
    page.evaluate("window.Weiguang.storage.commit(d => d.activities.push({id:'one', title:'散步五分钟', date:window.Weiguang.utils.localDate(), time:'',minutes:5,category:'care',step:'穿上鞋',why:'',status:'',created:1,note:'',skipReason:''}))")
    page.evaluate('window.Weiguang.sync.action("syncNow")')
    page.wait_for_function('window.__cloud.payload.activities.length === 1')
    page.evaluate("window.__offline = true; window.Weiguang.storage.commit(d => d.activities[0].title = '离线修改')")
    page.evaluate('window.Weiguang.sync.action("syncNow")')
    assert page.evaluate('window.Weiguang.state.data.activities[0].title') == '离线修改'
    assert page.evaluate('window.__cloud.payload.activities[0].title') == '散步五分钟'
    page.evaluate("window.__offline = false; window.__cloud.payload.activities[0].title = '另一台设备的修改'; window.__cloud.revision++")
    page.evaluate('window.Weiguang.sync.action("syncNow")')
    page.get_by_role('button', name='冲突记录保留本地版本').wait_for()
    page.screenshot(path=str(ARTIFACTS / 'sync-mobile-conflict.png'), full_page=True)
    page.get_by_role('button', name='冲突记录保留本地版本').click()
    page.wait_for_function('window.__cloud.payload.activities[0].title === "离线修改"')
    page.evaluate('window.Weiguang.pages.setPage("today")')
    assert page.locator('[data-task-id="one"]').count() == 1
    page.locator('#syncChip').click()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'sync-mobile.png'), full_page=True)
    page.get_by_role('button', name='退出登录', exact=True).click()
    page.get_by_role('button', name='使用 GitHub 登录').wait_for()
    assert page.evaluate('window.Weiguang.state.data.activities.length') == 1
    assert not errors, errors
    browser.close()
print('PASS real SDK GitHub/Google OAuth redirects, backup export, mobile login/enable, upload, offline save, conflict resolution, logout, and layout')
