-- BARBEARIA SaaS MULTIEMPRESA
-- Projeto Supabase NOVO recomendado.
create extension if not exists pgcrypto;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text default '',
  system_role text not null default 'user' check(system_role in('user','superadmin')),
  created_at timestamptz not null default now()
);

create table if not exists public.plans(
  id text primary key,
  name text not null,
  price_monthly numeric(10,2) not null default 0,
  max_barbers integer not null default 3,
  active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.plans(id,name,price_monthly,max_barbers,sort_order) values
('starter','Starter',79.00,3,1),
('pro','Pro',119.00,8,2),
('premium','Premium',169.00,30,3)
on conflict(id) do nothing;

create table if not exists public.tenants(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check(char_length(trim(name)) between 2 and 100),
  slug text not null unique check(slug ~ '^[a-z0-9-]{3,50}$'),
  status text not null default 'trial' check(status in('trial','active','suspended','cancelled')),
  logo_url text,
  hero_image_url text,
  brand_primary text not null default '#d0a255',
  brand_secondary text not null default '#f2cf86',
  hero_text text not null default 'Agende seu horário online.',
  about_text text not null default 'Atendimento profissional e agenda organizada.',
  phone text default '',
  instagram text default '',
  address text default '',
  open_time time not null default '08:00',
  close_time time not null default '19:00',
  slot_interval_minutes integer not null default 30 check(slot_interval_minutes between 15 and 180),
  work_days integer[] not null default array[1,2,3,4,5,6],
  blocked_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members(
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check(role in('owner','admin','staff')),
  created_at timestamptz not null default now(),
  primary key(tenant_id,user_id)
);

create table if not exists public.subscriptions(
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'trial' check(status in('trial','active','past_due','cancelled')),
  current_period_end timestamptz,
  provider text default 'manual',
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text default '',
  price numeric(10,2) not null default 0 check(price>=0),
  duration_minutes integer not null default 30 check(duration_minutes>=10),
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists services_tenant_idx on public.services(tenant_id);

create table if not exists public.barbers(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 80),
  photo_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists barbers_tenant_idx on public.barbers(tenant_id);

create table if not exists public.bookings(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  protocol uuid not null default gen_random_uuid(),
  client_name text not null check(char_length(trim(client_name)) between 2 and 80),
  phone text not null check(char_length(trim(phone)) between 8 and 25),
  service_id uuid references public.services(id) on delete restrict,
  service_name text not null,
  price numeric(10,2) not null default 0,
  duration_minutes integer not null default 30,
  barber_id uuid references public.barbers(id) on delete restrict,
  barber_name text not null,
  booking_date date not null,
  booking_time time not null,
  notes text default '',
  status text not null default 'confirmado' check(status in('confirmado','concluido','cancelado')),
  created_at timestamptz not null default now()
);
create index if not exists bookings_tenant_date_idx on public.bookings(tenant_id,booking_date);
create index if not exists bookings_barber_idx on public.bookings(tenant_id,barber_id,booking_date);
create unique index if not exists bookings_unique_start
  on public.bookings(tenant_id,barber_id,booking_date,booking_time)
  where status<>'cancelado';

-- Perfil automático
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,full_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Funções de segurança
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.system_role='superadmin'); $$;

create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.tenant_members m where m.tenant_id=p_tenant and m.user_id=auth.uid()); $$;

create or replace function public.is_tenant_admin(p_tenant uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select public.is_superadmin() or exists(select 1 from public.tenant_members m where m.tenant_id=p_tenant and m.user_id=auth.uid() and m.role in('owner','admin')); $$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;
revoke all on function public.is_tenant_member(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;
revoke all on function public.is_tenant_admin(uuid) from public;
grant execute on function public.is_tenant_admin(uuid) to authenticated;

-- Criação de conta/tenant
create or replace function public.create_tenant_account(p_name text,p_slug text,p_owner_name text default '')
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_slug text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'É necessário estar autenticado.'; end if;
  v_slug:=lower(trim(both '-' from regexp_replace(trim(coalesce(p_slug,'')),'[^a-zA-Z0-9-]+','-','g')));
  if v_slug !~ '^[a-z0-9-]{3,50}$' then raise exception 'Link inválido.'; end if;
  if exists(select 1 from public.tenants where slug=v_slug) then raise exception 'Este link já está em uso.'; end if;

  insert into public.profiles(id,full_name) values(v_uid,trim(coalesce(p_owner_name,'')))
  on conflict(id) do update set full_name=case when excluded.full_name<>'' then excluded.full_name else public.profiles.full_name end;

  insert into public.tenants(owner_id,name,slug) values(v_uid,trim(p_name),v_slug) returning id into v_id;
  insert into public.tenant_members(tenant_id,user_id,role) values(v_id,v_uid,'owner');
  insert into public.subscriptions(tenant_id,plan_id,status) values(v_id,'starter','trial');
  return v_id;
end;
$$;
revoke all on function public.create_tenant_account(text,text,text) from public;
grant execute on function public.create_tenant_account(text,text,text) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.bookings enable row level security;

create policy "profile self read" on public.profiles for select to authenticated using(id=auth.uid() or public.is_superadmin());
create policy "profile self update" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create policy "plans public read" on public.plans for select to anon,authenticated using(active=true);
create policy "plans superadmin manage" on public.plans for all to authenticated using(public.is_superadmin()) with check(public.is_superadmin());

create policy "tenants member read" on public.tenants for select to authenticated using(public.is_tenant_member(id) or public.is_superadmin());
create policy "tenants admin update" on public.tenants for update to authenticated using(public.is_tenant_admin(id)) with check(public.is_tenant_admin(id));
create policy "tenants superadmin all" on public.tenants for all to authenticated using(public.is_superadmin()) with check(public.is_superadmin());

create policy "members own tenant read" on public.tenant_members for select to authenticated using(user_id=auth.uid() or public.is_tenant_admin(tenant_id) or public.is_superadmin());
create policy "members admin manage" on public.tenant_members for all to authenticated using(public.is_tenant_admin(tenant_id)) with check(public.is_tenant_admin(tenant_id));

create policy "subscriptions member read" on public.subscriptions for select to authenticated using(public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy "subscriptions superadmin manage" on public.subscriptions for all to authenticated using(public.is_superadmin()) with check(public.is_superadmin());

create policy "services public read active" on public.services for select to anon,authenticated using(active=true and exists(select 1 from public.tenants t where t.id=tenant_id and t.status in('trial','active')));
create policy "services member read" on public.services for select to authenticated using(public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy "services admin manage" on public.services for all to authenticated using(public.is_tenant_admin(tenant_id)) with check(public.is_tenant_admin(tenant_id));

create policy "barbers public read active" on public.barbers for select to anon,authenticated using(active=true and exists(select 1 from public.tenants t where t.id=tenant_id and t.status in('trial','active')));
create policy "barbers member read" on public.barbers for select to authenticated using(public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy "barbers admin manage" on public.barbers for all to authenticated using(public.is_tenant_admin(tenant_id)) with check(public.is_tenant_admin(tenant_id));

create policy "bookings member read" on public.bookings for select to authenticated using(public.is_tenant_member(tenant_id) or public.is_superadmin());
create policy "bookings admin update" on public.bookings for update to authenticated using(public.is_tenant_admin(tenant_id)) with check(public.is_tenant_admin(tenant_id));
create policy "bookings admin delete" on public.bookings for delete to authenticated using(public.is_tenant_admin(tenant_id));


-- Dados públicos seguros da barbearia (não expõe owner_id nem campos internos)
create or replace function public.get_public_tenant(p_slug text)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'id',t.id,
    'name',t.name,
    'slug',t.slug,
    'logo_url',t.logo_url,
    'hero_image_url',t.hero_image_url,
    'brand_primary',t.brand_primary,
    'brand_secondary',t.brand_secondary,
    'hero_text',t.hero_text,
    'about_text',t.about_text,
    'phone',t.phone,
    'instagram',t.instagram,
    'address',t.address,
    'open_time',t.open_time,
    'close_time',t.close_time,
    'slot_interval_minutes',t.slot_interval_minutes,
    'work_days',t.work_days
  )
  from public.tenants t
  where t.slug=p_slug and t.status in('trial','active')
  limit 1;
$$;
revoke all on function public.get_public_tenant(text) from public;
grant execute on function public.get_public_tenant(text) to anon,authenticated;

-- Horários públicos por barbearia/profissional/serviço
create or replace function public.get_public_available_times(
  p_tenant_slug text,p_date date,p_barber_id uuid,p_service_id uuid
)
returns table(available_time time)
language plpgsql security definer set search_path=public
as $$
declare
  t public.tenants%rowtype;
  requested_duration integer;
  weekday integer;
begin
  select * into t from public.tenants where slug=p_tenant_slug and status in('trial','active');
  if not found then return; end if;

  if not exists(select 1 from public.barbers b where b.id=p_barber_id and b.tenant_id=t.id and b.active=true) then return; end if;
  select duration_minutes into requested_duration from public.services s where s.id=p_service_id and s.tenant_id=t.id and s.active=true;
  if requested_duration is null then return; end if;

  weekday:=extract(dow from p_date)::integer;
  if not(weekday=any(t.work_days)) then return; end if;
  if p_date=any(t.blocked_dates) then return; end if;
  if p_date < (now() at time zone 'America/Sao_Paulo')::date then return; end if;

  return query
  with candidate as(
    select gs::time as slot_time
    from generate_series(
      p_date+t.open_time,
      p_date+t.close_time-make_interval(mins=>requested_duration),
      make_interval(mins=>t.slot_interval_minutes)
    ) gs
  )
  select c.slot_time
  from candidate c
  where
    (p_date+c.slot_time) > case
      when p_date=(now() at time zone 'America/Sao_Paulo')::date then (now() at time zone 'America/Sao_Paulo')
      else p_date::timestamp-interval '1 second'
    end
    and not exists(
      select 1 from public.bookings b
      where b.tenant_id=t.id and b.barber_id=p_barber_id and b.booking_date=p_date and b.status<>'cancelado'
        and (p_date+c.slot_time) < (p_date+b.booking_time+make_interval(mins=>b.duration_minutes))
        and (p_date+c.slot_time+make_interval(mins=>requested_duration)) > (p_date+b.booking_time)
    )
  order by c.slot_time;
end;
$$;
revoke all on function public.get_public_available_times(text,date,uuid,uuid) from public;
grant execute on function public.get_public_available_times(text,date,uuid,uuid) to anon,authenticated;

create or replace function public.create_public_booking(
  p_tenant_slug text,p_client_name text,p_phone text,p_service_id uuid,p_barber_id uuid,
  p_booking_date date,p_booking_time time,p_notes text default ''
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  t public.tenants%rowtype;
  s public.services%rowtype;
  b public.barbers%rowtype;
  ok boolean;
  new_protocol uuid;
begin
  if char_length(trim(coalesce(p_client_name,'')))<2 then raise exception 'Informe seu nome.'; end if;
  if char_length(trim(coalesce(p_phone,'')))<8 then raise exception 'Informe um WhatsApp válido.'; end if;

  select * into t from public.tenants where slug=p_tenant_slug and status in('trial','active');
  if not found then raise exception 'Barbearia indisponível.'; end if;
  select * into s from public.services where id=p_service_id and tenant_id=t.id and active=true;
  if not found then raise exception 'Serviço indisponível.'; end if;
  select * into b from public.barbers where id=p_barber_id and tenant_id=t.id and active=true;
  if not found then raise exception 'Barbeiro indisponível.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(t.id::text||':'||b.id::text||':'||p_booking_date::text,0));

  select exists(
    select 1 from public.get_public_available_times(t.slug,p_booking_date,b.id,s.id)
    where available_time=p_booking_time
  ) into ok;
  if not ok then raise exception 'Este horário não está mais disponível. Escolha outro.'; end if;

  insert into public.bookings(
    tenant_id,client_name,phone,service_id,service_name,price,duration_minutes,
    barber_id,barber_name,booking_date,booking_time,notes
  ) values(
    t.id,trim(p_client_name),trim(p_phone),s.id,s.name,s.price,s.duration_minutes,
    b.id,b.name,p_booking_date,p_booking_time,left(coalesce(p_notes,''),250)
  ) returning protocol into new_protocol;

  return new_protocol;
end;
$$;
revoke all on function public.create_public_booking(text,text,text,uuid,uuid,date,time,text) from public;
grant execute on function public.create_public_booking(text,text,text,uuid,uuid,date,time,text) to anon,authenticated;


-- Endurecimento de privilégios para instalações SaaS.
-- O usuário comum pode editar o próprio nome, mas não system_role.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;

-- O tenant não pode alterar diretamente owner_id, slug ou status.
revoke insert, delete, truncate, references, trigger on public.tenants from anon, authenticated;
revoke update on public.tenants from authenticated;
grant select on public.tenants to authenticated;
grant update(
  name,logo_url,hero_image_url,brand_primary,brand_secondary,hero_text,about_text,
  phone,instagram,address,open_time,close_time,slot_interval_minutes,work_days,
  blocked_dates,updated_at
) on public.tenants to authenticated;

-- Funções internas.
revoke all on function public.handle_new_user() from public;
revoke execute on function public.is_superadmin() from anon;
revoke execute on function public.is_tenant_member(uuid) from anon;
revoke execute on function public.is_tenant_admin(uuid) from anon;
revoke execute on function public.create_tenant_account(text,text,text) from anon;
