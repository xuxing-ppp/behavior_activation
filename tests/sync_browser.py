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
window.__deleteFail = false;
window.__deleteCalls = 0;
window.supabase = {createClient: () => {
 let listener;
 return {
  auth: {
   onAuthStateChange(fn) { listener = fn; },
   async getSession() { return {data:{session:null}}; },
   async signInWithOAuth(options) {
    window.__loginOptions = options;
    listener('SIGNED_IN', {access_token:'test-access-token',user:{id:'test-user',user_metadata:{user_name:'测试账号'},identities:[{provider:'github'},{provider:'google'}]}}); return {};
   },
   async signOut() { listener('SIGNED_OUT', null); return {}; }
  },
  functions: {async invoke(name, options) {
   window.__deleteCalls++;
   if(window.__deleteFail) return {error:Error('service unavailable')};
   window.__cloud = null;
   return {data:{deleted:true,userId:'test-user'}};
  }},
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
        assert 'prompt=select_account' in page.url
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
    page.get_by_role('button', name='切换账号', exact=True).click()
    page.get_by_role('dialog').screenshot(path=str(ARTIFACTS / 'sync-mobile-switch.png'))
    page.set_viewport_size({'width':1280,'height':900})
    page.get_by_role('dialog').screenshot(path=str(ARTIFACTS / 'sync-desktop-switch.png'))
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('dialog').get_by_role('button', name='取消', exact=True).click()
    assert page.get_by_role('button', name='退出登录', exact=True).count() == 1
    page.get_by_role('button', name='切换账号', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='使用 GitHub 登录', exact=True).click()
    assert page.evaluate('window.__loginOptions.provider') == 'github'
    assert page.evaluate('window.__loginOptions.options.queryParams.prompt') == 'select_account'
    assert page.get_by_role('dialog').count() == 0
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
    page.get_by_role('button', name='关闭自动同步', exact=True).click()
    page.get_by_role('button', name='开启自动同步', exact=True).wait_for()
    assert page.get_by_role('button', name='退出登录', exact=True).count() == 1
    assert page.get_by_role('button', name='立即同步', exact=True).count() == 0
    page.evaluate("window.Weiguang.storage.commit(d => d.activities[0].title = '关闭同步后的本地修改')")
    page.evaluate('window.Weiguang.sync.action("syncNow")')
    assert page.evaluate('window.__cloud.payload.activities[0].title') == '离线修改'
    assert page.evaluate('JSON.parse(localStorage.getItem("weiguang-ba-v1"))._sync.enabled') is False
    page.screenshot(path=str(ARTIFACTS / 'sync-mobile-disabled.png'), full_page=True)
    page.get_by_role('button', name='开启自动同步', exact=True).click()
    page.wait_for_function('window.__cloud.payload.activities[0].title === "关闭同步后的本地修改"')
    page.get_by_role('button', name='退出登录', exact=True).click()
    page.get_by_role('button', name='使用 GitHub 登录').wait_for()
    assert page.evaluate('window.Weiguang.state.data.activities.length') == 1
    page.get_by_role('button', name='使用 Google 登录', exact=True).click()
    page.get_by_role('button', name='注销账号', exact=True).click()
    page.get_by_role('heading', name='注销微光账号', exact=True).wait_for()
    assert page.get_by_text('如果 GitHub 和 Google 已关联，两种登录身份会一起删除。', exact=False).count() == 1
    page.get_by_role('button', name='确认注销账号', exact=True).click()
    assert page.evaluate('window.__deleteCalls') == 0
    page.get_by_role('button', name='取消', exact=True).click()
    assert page.evaluate('window.__cloud !== null')
    page.get_by_role('button', name='注销账号', exact=True).click()
    page.locator('#deleteAccountText').fill('注销')
    page.evaluate('window.__deleteFail = true')
    page.get_by_role('button', name='确认注销账号', exact=True).click()
    page.locator('#deleteAccountStatus').filter(has_text='注销未确认').wait_for()
    assert page.evaluate('JSON.parse(localStorage.getItem("weiguang-ba-v1"))._sync.enabled') is False
    assert page.evaluate('window.Weiguang.state.data.activities.length') == 1
    page.screenshot(path=str(ARTIFACTS / 'sync-mobile-delete-account.png'), full_page=True)
    page.evaluate('window.__deleteFail = false')
    page.get_by_role('button', name='确认注销账号', exact=True).click()
    page.get_by_role('button', name='使用 Google 登录', exact=True).wait_for()
    assert page.get_by_role('dialog').count() == 0
    assert page.evaluate('window.__cloud') is None
    assert page.evaluate('window.Weiguang.state.data.activities.length') == 1
    assert page.evaluate('window.Weiguang.state.data._sync') is None
    # Another browser/device may still retain the deleted account's old user ID.
    page.evaluate("""() => {
        const app = window.Weiguang;
        const data = structuredClone(app.state.data);
        data._sync = {owner:'deleted-user-id',enabled:true,base:{activities:[],moods:{},version:1}};
        app.storage.save(data, {remote:true});
    }""")
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#syncChip').click()
    page.get_by_role('button', name='使用 Google 登录', exact=True).click()
    page.get_by_role('button', name='重新关联当前账号', exact=True).wait_for()
    assert page.get_by_role('button', name='开启自动同步', exact=True).count() == 0
    assert page.evaluate('window.__cloud') is None
    page.screenshot(path=str(ARTIFACTS / 'sync-mobile-relink.png'), full_page=True)
    page.set_viewport_size({'width':1280,'height':900})
    page.screenshot(path=str(ARTIFACTS / 'sync-desktop-relink.png'), full_page=True)
    page.get_by_role('button', name='重新关联当前账号', exact=True).click()
    page.get_by_role('button', name='开启自动同步', exact=True).wait_for()
    assert page.evaluate('window.Weiguang.state.data._sync.owner') == 'test-user'
    assert page.evaluate('window.Weiguang.state.data._sync.enabled') is False
    assert page.evaluate('window.Weiguang.state.data.activities.length') == 1
    assert page.evaluate('window.__cloud') is None
    assert page.evaluate('JSON.parse(localStorage.getItem("weiguang-ba-v1-before-cloud-merge")).data.activities.length') == 1
    page.get_by_role('button', name='开启自动同步', exact=True).click()
    page.wait_for_function('window.__cloud?.payload.activities.length === 1')
    assert not errors, errors
    browser.close()
print('PASS real SDK GitHub/Google OAuth redirects, backup export, mobile login/enable, upload, offline save, conflict resolution, disable/re-enable, logout, account deletion confirmation/retry, stale account relink, account selection/switching, and layout')
