-- Decision 1 (Dany, 08/10/2026): editor and marketing never see money. The
-- product list carries list prices and the usual instalment plan, and since
-- 26/09/2026 every role read it (current_role() is not null). Only Economics
-- code reads products (calls, sales, the closer's day, settings, Alfire's
-- economics tools): admin, setter and closer keep it, the others lose a read
-- no page of theirs uses.
-- Own migration, with its own test (supabase/tests/68_prodotti_solo_economics.sql);
-- confirmed by Dany on 09/10/2026 («Sì, solo Economics»).
drop policy if exists products_select_authenticated on public.products;
create policy products_select_economics
  on public.products for select
  to authenticated
  using (coalesce(public.current_role() in ('admin', 'setter', 'closer'), false));
