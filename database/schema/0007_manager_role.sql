-- 0007_manager_role.sql
-- Adds the site manager role. Kept in its own file because a new enum value
-- cannot be used until the transaction that added it has committed; the
-- policies and functions that use it are in 0008.
--
-- A manager is scoped to ONE site: their own profiles.home_site_id.

alter type public.user_role add value if not exists 'manager';
