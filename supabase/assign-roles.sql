-- تعيين حساب مالك النظام وحساب إدارة المركز.
-- يجب إنشاء الحسابين أولًا من Authentication > Users.

insert into public.profiles (id, full_name, role)
select id, 'Mohammad AL Faqeh', 'owner'
from auth.users
where lower(email) = lower('mohammadalfaqeeh73@gmail.com')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    updated_at = timezone('utc', now());

insert into public.profiles (id, full_name, role)
select id, 'إدارة مركز كفرأبيل القرآني', 'admin'
from auth.users
where lower(email) = lower('loordmohammad79@gmail.com')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    updated_at = timezone('utc', now());

-- تظهر النتيجة حسابين إذا كانا قد أُنشئا بطريقة صحيحة.
select
  users.email,
  profiles.full_name,
  profiles.role
from public.profiles as profiles
join auth.users as users on users.id = profiles.id
where lower(users.email) in (
  lower('mohammadalfaqeeh73@gmail.com'),
  lower('loordmohammad79@gmail.com')
)
order by profiles.role desc;
