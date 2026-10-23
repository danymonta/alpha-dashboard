import { Package } from "lucide-react";

import {
  AttivoProdotto,
  ProdottoForm,
} from "@/app/(app)/settings/products/prodotto-form";
import { IntestazionePagina } from "@/components/pagina/intestazione";
import { StatoVuoto } from "@/components/stati/stato-vuoto";
import { requireRuolo } from "@/lib/auth/session";
import { formato, type Formato } from "@/lib/format";
import { getLingua } from "@/lib/i18n/server";
import { IMPOSTAZIONI } from "@/lib/i18n/testi/impostazioni";
import { createClient } from "@/lib/supabase/server";
import {
  leggiPianoPredefinito,
  type PianoPredefinito,
} from "@/lib/validation/anagrafiche";

export const dynamic = "force-dynamic";

/** "3 × 500,00 € poi 3 × 333,33 €": runs of equal instalments, in order. */
function descriviPiano(piano: PianoPredefinito, formatEuro: Formato["formatEuro"], poi: string) {
  const gruppi: { n: number; importo: number }[] = [];
  for (const r of [...piano].sort((a, b) => a.mese - b.mese)) {
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.importo === r.importo) ultimo.n += 1;
    else gruppi.push({ n: 1, importo: r.importo });
  }
  return gruppi.map((g) => `${g.n} × ${formatEuro(g.importo)}`).join(poi);
}

export default async function ProdottiPage() {
  await requireRuolo(["admin"]);
  const lingua = await getLingua();
  const T = IMPOSTAZIONI[lingua];
  const t = T.prodotti;
  const { formatEuro } = formato(lingua);
  const supabase = await createClient();
  const { data: prodotti, error } = await supabase
    .from("products")
    .select("id, nome, durata_mesi, prezzo_listino, attivo, piano_predefinito")
    .order("attivo", { ascending: false })
    .order("durata_mesi");
  if (error) throw new Error(t.errore);

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: "/settings", etichetta: T.titolo }}
        titolo={T.sezioni.products[0]}
        descrizione={t.descrizione}
        azione={<ProdottoForm />}
      />

      {prodotti.length === 0 ? (
        <StatoVuoto
          Icona={Package}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
          azione={<ProdottoForm />}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card">
          {prodotti.map((p) => {
            const piano = leggiPianoPredefinito(p.piano_predefinito);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 px-3 py-2"
              >
                {/* mobile: name on its own row, price and controls on the row below */}
                <div className="min-w-0 basis-full md:basis-0 md:flex-1">
                  <p className="text-sm font-medium">{p.nome}</p>
                  <p className="num text-sm text-muted-foreground">
                    {t.mesi(p.durata_mesi)}
                    {piano ? ` · ${descriviPiano(piano, formatEuro, t.poi)}` : t.rateUguali}
                  </p>
                </div>
                <p className="num mr-auto text-sm font-medium md:mr-0 md:w-24 md:text-right">
                  {formatEuro(p.prezzo_listino)}
                </p>
                <AttivoProdotto id={p.id} nome={p.nome} attivo={p.attivo} />
                <ProdottoForm
                  prodotto={{ ...p, piano_predefinito: piano }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
