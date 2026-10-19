-- 在 Supabase → SQL Editor → New query 粘贴执行；可重复执行。
-- 每个用户只有一份快照。所有写入必须经过带版本校验的函数，防止并发覆盖。
begin;

create table if not exists public.weiguang_sync (
    user_id uuid primary key references auth.users(id) on delete cascade,
    payload jsonb not null,
    revision integer not null default 1 check (revision > 0),
    updated_at timestamptz not null default now(),
    constraint weiguang_payload_shape check (
        jsonb_typeof(payload) = 'object' and
        jsonb_typeof(payload -> 'activities') = 'array' and
        jsonb_typeof(payload -> 'moods') = 'object' and
        payload ->> 'version' = '1'
    )
);

alter table public.weiguang_sync enable row level security;
revoke all on table public.weiguang_sync from anon, authenticated;
grant select on table public.weiguang_sync to authenticated;
drop policy if exists "Read own sync records" on public.weiguang_sync;
create policy "Read own sync records" on public.weiguang_sync
    for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.save_weiguang_sync(expected_revision integer, new_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    affected integer;
begin
    if caller is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if expected_revision is null or expected_revision < 0 or
        new_payload is null or
        jsonb_typeof(new_payload) is distinct from 'object' or
        jsonb_typeof(new_payload -> 'activities') is distinct from 'array' or
        jsonb_typeof(new_payload -> 'moods') is distinct from 'object' or
        (new_payload ->> 'version') is distinct from '1' or
        octet_length(new_payload::text) > 5000000 then
        raise exception 'Invalid sync payload' using errcode = '22023';
    end if;
    if jsonb_array_length(new_payload -> 'activities') > 30000 then
        raise exception 'Too many activities' using errcode = '22023';
    end if;
    if expected_revision = 0 then
        insert into public.weiguang_sync(user_id, payload, revision)
            values (caller, new_payload, 1)
            on conflict (user_id) do nothing;
    else
        update public.weiguang_sync
            set payload = new_payload, revision = revision + 1, updated_at = now()
            where user_id = caller and revision = expected_revision;
    end if;
    get diagnostics affected = row_count;
    return affected = 1;
end;
$$;

revoke all on function public.save_weiguang_sync(integer, jsonb) from public, anon;
grant execute on function public.save_weiguang_sync(integer, jsonb) to authenticated;

commit;
