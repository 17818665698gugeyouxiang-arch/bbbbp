-- Additive hardening; keeps all existing rows, history, bucket objects and game tables.
begin;
create or replace function public.study_encode_id(value text) returns text language plpgsql immutable strict set search_path='' as $$
declare result text='';i integer;b integer;bytes bytea=convert_to(value,'UTF8');
begin
 for i in 0..length(bytes)-1 loop
  b=get_byte(bytes,i);
  if (b between 65 and 90) or (b between 97 and 122) or (b between 48 and 57) or b in (45,95,46,33,126,42,39,40,41) then result=result||chr(b);else result=result||'%'||upper(lpad(to_hex(b),2,'0'));end if;
 end loop;
 return result;
end;$$;
revoke all on function public.study_encode_id(text) from public,anon,authenticated;
create or replace function public.study_head() returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.study_states;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into s from public.study_states where user_id=auth.uid();
 if not found then return null;end if;
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision);
end;$$;
create or replace function public.study_get() returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.study_states;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 insert into public.study_states(user_id) values(auth.uid()) on conflict do nothing;
 select * into s from public.study_states where user_id=auth.uid();
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data);
end;$$;
create or replace function public.study_put(expected_revision bigint,incoming jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.study_states;t text;v jsonb;part jsonb;active_count integer;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into s from public.study_states where user_id=auth.uid() for update;
 if not found or s.revision<>expected_revision then raise exception 'STUDY_CONFLICT';end if;
 if incoming is null or jsonb_typeof(incoming)<>'object' or octet_length(incoming::text)>10485760 then raise exception 'Invalid snapshot';end if;
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
   if coalesce(v->>'hash','')!~'^[a-f0-9]{64}$' or coalesce(v->>'mime','')!~'^image/(jpeg|png|webp|gif|avif|bmp)$' then raise exception 'Invalid photo';end if;
  end loop;
 end loop;
 -- IDs must be unambiguous across both image tables.
 if (select count(*) from (select x->>'id' id from jsonb_array_elements(incoming->'photos') x union all select x->>'id' from jsonb_array_elements(incoming->'csAnswerPhotos') x) p)
  <> (select count(distinct id) from (select x->>'id' id from jsonb_array_elements(incoming->'photos') x union all select x->>'id' from jsonb_array_elements(incoming->'csAnswerPhotos') x) p) then raise exception 'Duplicate photo id';end if;
 if exists(select 1 from jsonb_array_elements(incoming->'entries') e where not exists(select 1 from jsonb_array_elements(incoming->'mistakes') m where m->>'id'=e->>'mistakeId')) then raise exception 'Invalid entry reference';end if;
 if exists(select 1 from jsonb_array_elements(incoming->'csAnswers') a where not exists(select 1 from jsonb_array_elements(incoming->'sessions') q where q->>'id'=a->>'sessionId')) then raise exception 'Invalid answer reference';end if;
 foreach t in array array['photos','csAnswerPhotos'] loop
  for v in select * from jsonb_array_elements(incoming->t) loop
   if not exists(select 1 from jsonb_array_elements(incoming->case when t='photos' then 'entries' else 'csAnswers' end) p where p->>'id'=v->>'entryId') then raise exception 'Invalid photo reference';end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='study-photos' and o.name in (auth.uid()::text||'/'||(v->>'id'),auth.uid()::text||'/'||public.study_encode_id(v->>'id')) and coalesce(o.metadata->>'mimetype','')=v->>'mime') then raise exception 'Photo object missing or not owned';end if;
  end loop;
 end loop;
 -- A repeat save of the same snapshot is idempotent, with no extra history/write.
 if incoming=s.data then return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data);end if;
 insert into public.study_daily_history(user_id,revision,data) values(auth.uid(),s.revision,s.data) on conflict do nothing;
 update public.study_states set data=incoming,revision=revision+1,updated_at=now() where user_id=auth.uid() returning * into s;
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data);
end;$$;
revoke all on function public.study_head(),public.study_get(),public.study_put(bigint,jsonb) from public,anon;
grant execute on function public.study_head(),public.study_get(),public.study_put(bigint,jsonb) to authenticated;
commit;
