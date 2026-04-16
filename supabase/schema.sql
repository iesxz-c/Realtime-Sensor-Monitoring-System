create table if not exists public.device_state (
    id bigint generated always as identity primary key,
    device_id text not null unique,
    temperature double precision,
    humidity double precision,
    rain_sensor double precision,
    ph double precision,
    air_quality bigint,
    motion_detected boolean default false,
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.device_state add column if not exists rain_sensor double precision;
alter table public.device_state add column if not exists ph double precision;
alter table public.device_state add column if not exists air_quality bigint;
alter table public.device_state add column if not exists motion_detected boolean default false;
alter table public.device_state drop column if exists water_level;
alter table public.device_state drop column if exists noise_level;
alter table public.device_state drop column if exists light_intensity;
alter table public.device_state drop column if exists gas;
create or replace function public.set_device_state_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = timezone('utc', now());
return new;
end;
$$;
drop trigger if exists trg_device_state_updated_at on public.device_state;
create trigger trg_device_state_updated_at before
update on public.device_state for each row execute function public.set_device_state_updated_at();
alter table public.device_state enable row level security;
drop policy if exists "public can read device_state" on public.device_state;
create policy "public can read device_state" on public.device_state for
select to anon,
    authenticated using (true);
drop policy if exists "public can insert device_state" on public.device_state;
create policy "public can insert device_state" on public.device_state for
insert to anon,
    authenticated with check (true);
drop policy if exists "public can update device_state" on public.device_state;
create policy "public can update device_state" on public.device_state for
update to anon,
    authenticated using (true) with check (true);
do $$
begin
    alter publication supabase_realtime add table public.device_state;
exception
    when duplicate_object then null;
end;
$$;