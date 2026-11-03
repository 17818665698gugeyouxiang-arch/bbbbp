-- Support computer-science complete-question topic practice; preserve all existing records and grants.
begin;
create or replace function public.study_get() returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.study_states;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 insert into public.study_states(user_id) values(auth.uid()) on conflict do nothing;
 select * into s from public.study_states where user_id=auth.uid();
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data||jsonb_build_object('topicAttempts',coalesce(s.data->'topicAttempts','[]')),'capabilities',jsonb_build_array('fp1-topics-v1','cs-topics-v1'));
end;$$;
create or replace function public.study_put(expected_revision bigint,incoming jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.study_states;t text;v jsonb;part jsonb;active_count integer;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into s from public.study_states where user_id=auth.uid() for update;
 if not found or s.revision<>expected_revision then raise exception 'STUDY_CONFLICT';end if;
 if incoming is null or jsonb_typeof(incoming)<>'object' or octet_length(incoming::text)>10485760 then raise exception 'Invalid snapshot';end if;
 if not (incoming ? 'topicAttempts') and jsonb_array_length(coalesce(s.data->'topicAttempts','[]'))>0 then raise exception 'STUDY_CLIENT_UPGRADE';end if;
 foreach t in array array['sessions','mistakes','entries','photos','criticalAttempts','csAnswers','csAnswerPhotos','topicAttempts'] loop
  if incoming->t is null then incoming=jsonb_set(incoming,array[t],coalesce(s.data->t,'[]'));end if;
  part=incoming->t;
  if jsonb_typeof(part)<>'array' or jsonb_array_length(part)>50000 then raise exception 'Invalid table %',t;end if;
  if exists(select 1 from jsonb_array_elements(part) x where jsonb_typeof(x)<>'object' or coalesce(x->>'id','')='' or length(x->>'id')>500) then raise exception 'Invalid row';end if;
  if (select count(*) from jsonb_array_elements(part))<>(select count(distinct x->>'id') from jsonb_array_elements(part) x) then raise exception 'Duplicate id';end if;
  if t not in ('photos','csAnswerPhotos') and exists(select 1 from jsonb_array_elements(s.data->t) old where not exists(select 1 from jsonb_array_elements(part) newer where newer->>'id'=old->>'id')) then raise exception 'Existing records cannot be removed';end if;
 end loop;
 select count(*) into active_count from (select * from jsonb_array_elements(incoming->'sessions') union all select * from jsonb_array_elements(incoming->'topicAttempts')) a(x) where x->>'submittedAt' is null and coalesce((x->>'archived')::boolean,false)=false;
 if active_count>1 then raise exception 'Only one active mock exam is allowed';end if;

 if exists(select 1 from jsonb_array_elements(incoming->'topicAttempts') a where
  coalesce(a->>'kind','') not in ('fp1-topics','cs-topics') or jsonb_typeof(a->'years') is distinct from 'array' or jsonb_typeof(a->'topics') is distinct from 'array' or jsonb_typeof(a->'refs') is distinct from 'array' or jsonb_typeof(a->'questionIds') is distinct from 'array' or jsonb_typeof(a->'grades') is distinct from 'object' or jsonb_typeof(a->'done') is distinct from 'array'
 ) then raise exception 'Invalid topic attempt';end if;
 for v in select * from jsonb_array_elements(incoming->'topicAttempts') loop
  if jsonb_array_length(v->'years')=0 or jsonb_array_length(v->'topics')=0 or jsonb_array_length(v->'refs')=0 or jsonb_array_length(v->'refs')>1000 or jsonb_array_length(v->'refs')<>jsonb_array_length(v->'questionIds') then raise exception 'Invalid topic selection';end if;
  if exists(select 1 from jsonb_array_elements(v->'years') y where jsonb_typeof(y)<>'number' or y::text!~'^20[0-9]{2}$') or exists(select 1 from jsonb_array_elements_text(v->'topics') chosen(topic_key) where case when v->>'kind'='cs-topics' then chosen.topic_key not in ('cs-development','cs-expressions','cs-control','cs-arrays','cs-subprograms','cs-files','cs-search-sort','cs-adt','cs-testing') else chosen.topic_key not in ('complex','quadratic-roots','series','matrices','coordinates','numerical','induction') end) then raise exception 'Invalid topic filter';end if;
  if (select count(distinct q) from jsonb_array_elements_text(v->'questionIds') q)<>jsonb_array_length(v->'refs') then raise exception 'Duplicate topic question';end if;
  if exists(select 1 from jsonb_array_elements(v->'refs') with ordinality r(x,i) where coalesce(x->>'paperId','')!~(case when v->>'kind'='cs-topics' then '^cs-(9608|9618)-20[0-9]{2}-[swm]-2[123]$' else '^fp1-[0-9]{4}-(01|06|10)-(old|new)$' end) or coalesce(x->>'questionId','')!~('^'||(x->>'paperId')||'-q[1-9][0-9]*$') or x->>'questionId' is distinct from v->'questionIds'->>(i::integer-1) or not (v->'years' @> to_jsonb((case when v->>'kind'='cs-topics' then split_part(x->>'paperId','-',3) else substring(x->>'paperId',5,4) end)::integer))) then raise exception 'Invalid topic question reference';end if;
  if coalesce(v->>'startedAt','')!~'^[0-9]+$' or coalesce(v->>'updatedAt','')!~'^[0-9]+$' or (v->>'startedAt')::numeric<=0 or (v->>'updatedAt')::numeric<(v->>'startedAt')::numeric or coalesce(v->>'position','')!~'^[0-9]+$' or coalesce(v->>'markingPosition','')!~'^[0-9]+$' or (v->>'position')::numeric>=jsonb_array_length(v->'refs') or (v->>'markingPosition')::numeric>=jsonb_array_length(v->'refs') then raise exception 'Invalid topic progress';end if;
  if v ? 'submittedAt' and ((v->>'submittedAt')::numeric<(v->>'startedAt')::numeric) or v ? 'completedAt' and (not (v ? 'submittedAt') or (v->>'completedAt')::numeric<(v->>'submittedAt')::numeric) then raise exception 'Invalid topic time';end if;
  if exists(select 1 from jsonb_array_elements(v->'done') q where not(v->'questionIds' @> jsonb_build_array(q))) or exists(select 1 from jsonb_each(v->'grades') g where not(v->'questionIds' ? g.key) or jsonb_typeof(g.value->'score') is distinct from 'string' or length(g.value->>'score')>100 or jsonb_typeof(g.value->'wrong') is distinct from 'boolean' or jsonb_typeof(g.value->'note') is distinct from 'string') then raise exception 'Invalid topic grade';end if;
  if v ? 'completedAt' and exists(select 1 from jsonb_array_elements_text(v->'questionIds') q where case when btrim(coalesce(v->'grades'->q->>'score',''))~'^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then (v->'grades'->q->>'score')::numeric<0 else true end) then raise exception 'Incomplete topic grading';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(s.data->'topicAttempts','[]')) old where old->>'id'=v->>'id' and (old->'kind' is distinct from v->'kind' or old->'refs' is distinct from v->'refs' or old->'questionIds' is distinct from v->'questionIds' or old->'years' is distinct from v->'years' or old->'topics' is distinct from v->'topics' or old->'startedAt' is distinct from v->'startedAt')) then raise exception 'Topic paper is immutable';end if;
 end loop;
 if (select count(*) from (select x->>'id' from jsonb_array_elements(incoming->'sessions') x union all select x->>'id' from jsonb_array_elements(incoming->'topicAttempts') x) a)<>(select count(distinct id) from (select x->>'id' id from jsonb_array_elements(incoming->'sessions') x union all select x->>'id' from jsonb_array_elements(incoming->'topicAttempts') x) a) then raise exception 'Duplicate attempt id';end if;
 if exists(select 1 from jsonb_array_elements(incoming->'entries') e where nullif(e->>'sessionId','') is not null and not exists(select 1 from (select * from jsonb_array_elements(incoming->'sessions') union all select * from jsonb_array_elements(incoming->'topicAttempts')) a(x) where x->>'id'=e->>'sessionId')) or exists(select 1 from jsonb_array_elements(incoming->'mistakes') m cross join lateral jsonb_array_elements_text(m->'sessionIds') sid where not exists(select 1 from (select * from jsonb_array_elements(incoming->'sessions') union all select * from jsonb_array_elements(incoming->'topicAttempts')) a(x) where x->>'id'=sid)) then raise exception 'Invalid attempt reference';end if;
 foreach t in array array['photos','csAnswerPhotos'] loop
  for v in select * from jsonb_array_elements(incoming->t) loop
   if coalesce(v->>'hash','')!~'^[a-f0-9]{64}$' or coalesce(v->>'mime','')!~'^image/(jpeg|png|webp|gif|avif|bmp)$' then raise exception 'Invalid photo';end if;
  end loop;
 end loop;
 -- IDs must be unambiguous across both image tables.
 if (select count(*) from (select x->>'id' id from jsonb_array_elements(incoming->'photos') x union all select x->>'id' from jsonb_array_elements(incoming->'csAnswerPhotos') x) p)
  <> (select count(distinct id) from (select x->>'id' id from jsonb_array_elements(incoming->'photos') x union all select x->>'id' from jsonb_array_elements(incoming->'csAnswerPhotos') x) p) then raise exception 'Duplicate photo id';end if;
 if exists(select 1 from jsonb_array_elements(incoming->'entries') e where not exists(select 1 from jsonb_array_elements(incoming->'mistakes') m where m->>'id'=e->>'mistakeId')) then raise exception 'Invalid entry reference';end if;
 if exists(select 1 from jsonb_array_elements(incoming->'csAnswers') a where not exists(select 1 from (select * from jsonb_array_elements(incoming->'sessions') where value->>'paperId' like 'cs-%' union all select * from jsonb_array_elements(incoming->'topicAttempts') where value->>'kind'='cs-topics') q where q.value->>'id'=a->>'sessionId' and q.value->'questionIds' ? (a->>'questionId'))) then raise exception 'Invalid answer reference';end if;
 foreach t in array array['photos','csAnswerPhotos'] loop
  for v in select * from jsonb_array_elements(incoming->t) loop
   if not exists(select 1 from jsonb_array_elements(incoming->case when t='photos' then 'entries' else 'csAnswers' end) p where p->>'id'=v->>'entryId') then raise exception 'Invalid photo reference';end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='study-photos' and o.name in (auth.uid()::text||'/'||(v->>'id'),auth.uid()::text||'/'||public.study_encode_id(v->>'id')) and coalesce(o.metadata->>'mimetype','')=v->>'mime') then raise exception 'Photo object missing or not owned';end if;
  end loop;
 end loop;
 -- A repeat save of the same snapshot is idempotent, with no extra history/write.
 if incoming=s.data then return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data,'capabilities',jsonb_build_array('fp1-topics-v1','cs-topics-v1'));end if;
 insert into public.study_daily_history(user_id,revision,data) values(auth.uid(),s.revision,s.data) on conflict do nothing;
 update public.study_states set data=incoming,revision=revision+1,updated_at=now() where user_id=auth.uid() returning * into s;
 return jsonb_build_object('serverId',s.server_id,'revision',s.revision,'data',s.data,'capabilities',jsonb_build_array('fp1-topics-v1','cs-topics-v1'));
end;$$;
revoke all on function public.study_get(),public.study_put(bigint,jsonb) from public,anon;
grant execute on function public.study_get(),public.study_put(bigint,jsonb) to authenticated;
commit;
