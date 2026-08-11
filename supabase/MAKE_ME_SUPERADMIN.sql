-- Troque pelo e-mail da conta que será dona da plataforma.
update public.profiles
set system_role='superadmin'
where id=(select id from auth.users where email='SEU_EMAIL_AQUI');
