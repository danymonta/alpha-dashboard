-- A product can carry its usual payment plan (Dany, 28/09/2026): e.g. "Annuale"
-- at 2.500 € paid as 3 × 500 and then 3 × 333,33. Months are counted from the
-- sale date; the new-sale form starts from it and stays editable row by row.
alter table public.products
  add column piano_predefinito jsonb
    constraint products_piano_predefinito_valido check (
      piano_predefinito is null
      or (jsonb_typeof(piano_predefinito) = 'array' and jsonb_array_length(piano_predefinito) between 1 and 60)
    );

comment on column public.products.piano_predefinito is
  'Usual plan: [{"mese": 0, "importo": 500}, ...], mese counted from the sale date. Null: equal monthly instalments.';
