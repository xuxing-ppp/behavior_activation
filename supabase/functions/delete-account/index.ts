// 本文件可直接粘贴到 Supabase Edge Function 编辑器，不依赖外部包。
// 仅从经 Auth 服务验证的会话确定用户；管理员凭据只读取服务端环境变量。
type HandlerOptions = { url?: string; adminKey?: string; fetchImpl?: typeof fetch };

export function createDeleteAccountHandler({ url, adminKey, fetchImpl = fetch }: HandlerOptions) {
    const origins = new Set(['https://xuxing-ppp.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
    return async (request: Request) => {
        const origin = request.headers.get('origin');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info'
        };
        if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
        const reply = (status, value) => new Response(JSON.stringify(value), { status, headers });
        if (origin && !origins.has(origin)) return reply(403, { error: 'origin_not_allowed' });
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
        if (!url || !adminKey) return reply(503, { error: 'server_not_configured' });
        const authorization = request.headers.get('authorization') || '';
        if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: 'sign_in_required' });
        let input;
        try {
            const text = await request.text();
            if (text.length > 1024) return reply(400, { error: 'invalid_confirmation' });
            input = JSON.parse(text);
        } catch { return reply(400, { error: 'invalid_confirmation' }); }
        if (input?.confirmation !== '注销' || typeof input.expectedUserId !== 'string')
            return reply(400, { error: 'invalid_confirmation' });
        try {
            // 实时验证会话；不能只解码 JWT，也不能相信浏览器传来的目标用户 ID。
            const identity = await fetchImpl(`${url}/auth/v1/user`, {
                headers: { apikey: adminKey, Authorization: authorization }, signal: AbortSignal.timeout(15000)
            });
            if (identity.status === 401 || identity.status === 403) return reply(401, { error: 'sign_in_required' });
            if (!identity.ok) return reply(503, { error: 'identity_service_unavailable' });
            const user = await identity.json();
            if (typeof user.id !== 'string' || !user.id) return reply(401, { error: 'sign_in_required' });
            if (user.id !== input.expectedUserId) return reply(409, { error: 'account_changed' });
            // 硬删除 Auth 用户；同步表通过外键 ON DELETE CASCADE 一并清理。
            const result = await fetchImpl(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
                method: 'DELETE',
                headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ should_soft_delete: false }), signal: AbortSignal.timeout(15000)
            });
            if (!result.ok) return reply(502, { error: 'account_deletion_failed' });
            return reply(200, { deleted: true, userId: user.id });
        } catch { return reply(503, { error: 'deletion_result_unknown' }); }
    };
}

if (typeof Deno !== 'undefined') {
    Deno.serve(createDeleteAccountHandler({
        url: Deno.env.get('SUPABASE_URL'),
        adminKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    }));
}
