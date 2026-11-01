-- Isolated study tables; does not modify Piggy Island tables or functions.
begin;
create table if not exists public.study_states (
 user_id uuid primary key references auth.users(id) on delete cascade,
 server_id uuid not null default gen_random_uuid(),
 revision bigint not null default 0,
 data jsonb not null default '{"sessions":[],"mistakes":[],"entries":[],"photos":[],"criticalAttempts":[],"csAnswers":[],"csAnswerPhotos":[]}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.study_daily_history (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null default current_date,
 revision bigint not null,
 data jsonb not null,
 primary key(user_id,day)
);
alter table public.study_states enable row level security;
alter table public.study_daily_history enable row level security;
revoke all on public.study_states,public.study_daily_history from anon,authenticated;
grant select on public.study_states,public.study_daily_history to authenticated;
create policy study_read_own on public.study_states for select to authenticated using(user_id=(select auth.uid()));
create policy study_history_read_own on public.study_daily_history for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.study_get() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.study_states;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 insert into public.study_states(user_id) values(auth.uid()) on conflict do nothing;
 select * into s from public.study_states where user_id=auth.uid();
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data);
end;$$;
create or replace function public.study_put(expected_revision bigint,incoming jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.study_states;t text;v jsonb;part jsonb;active_count integer;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into s from public.study_states where user_id=auth.uid() for update;
 if not found or s.revision<>expected_revision then raise exception 'STUDY_CONFLICT';end if;
 if jsonb_typeof(incoming)<>'object' or octet_length(incoming::text)>10485760 then raise exception 'Invalid snapshot';end if;
 foreach t in array array['sessions','mistakes','entries','photos','criticalAttempts','csAnswers','csAnswerPhotos'] loop
  if incoming->t is null then incoming=jsonb_set(incoming,array[t],coalesce(s.data->t,'[]'));end if;
  part=incoming->t;
  if jsonb_typeof(part)<>'array' or jsonb_array_length(part)>50000 then raise exception 'Invalid table %',t;end if;
  if exists(select 1 from jsonb_array_elements(part) x where jsonb_typeof(x)<>'object' or coalesce(x->>'id','')='' or length(x->>'id')>500) then raise exception 'Invalid row';end if;
  if (select count(*) from jsonb_array_elements(part))<>(select count(distinct x->>'id') from jsonb_array_elements(part) x) then raise exception 'Duplicate id';end if;
  if t not in ('photos','csAnswerPhotos') and exists(select 1 from jsonb_array_elements(s.data->t) old where not exists(select 1 from jsonb_array_elements(part) newer where newer->>'id'=old->>'id')) then raise exception 'Existing records cannot be removed';end if;
 end loop;
 select count(*) into active_count from jsonb_array_elements(incoming->'sessions') x where x->>'submittedAt' is null and coalesce((x->>'archived')::boolean,false)=false;
 if active_count>1 then raise exception 'Only one active mock exam is allowed';end if;
 foreach t in array array['photos','csAnswerPhotos'] loop
  for v in select * from jsonb_array_elements(incoming->t) loop
   if (v->>'hash')!~'^[a-f0-9]{64}$' or v->>'hash' is null or (v->>'mime')!~'^image/(jpeg|png|webp|gif|avif|bmp)$' then raise exception 'Invalid photo';end if;
  end loop;
 end loop;
 insert into public.study_daily_history(user_id,revision,data) values(auth.uid(),s.revision,s.data) on conflict do nothing;
 update public.study_states set data=incoming,revision=revision+1,updated_at=now() where user_id=auth.uid() returning * into s;
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data);
end;$$;
revoke all on function public.study_get(),public.study_put(bigint,jsonb) from public,anon;
grant execute on function public.study_get(),public.study_put(bigint,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('study-photos','study-photos',false,26214400,array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/bmp']) on conflict(id) do nothing;
create policy study_photo_read on storage.objects for select to authenticated using(bucket_id='study-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy study_photo_insert on storage.objects for insert to authenticated with check(bucket_id='study-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Immutable objects: no browser UPDATE or DELETE policy. Removed photos remain recoverable.
commit;
