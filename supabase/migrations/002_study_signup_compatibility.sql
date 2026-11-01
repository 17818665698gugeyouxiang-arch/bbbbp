-- Preserve the existing game signup behavior; study accounts need no player profile.
create or replace function public.create_player_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ->> 'study_app' = 'bpho-study' then
    return new;
  end if;
  insert into public.players (id, username, username_normalized)
  values (new.id, new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'username_normalized');
  insert into public.game_progress (player_id) values (new.id);
  return new;
end;
$$;
