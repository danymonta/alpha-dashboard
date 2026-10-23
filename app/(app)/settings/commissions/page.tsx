import {
  CircleCheck,
  CircleMinus,
  Clock,
  Percent,
  type LucideIcon,
} from "lucide-react";

import {
  ChiudiRegola,
  ModificaRegola,
  NuovaRegola,
} from "@/app/(app)/settings/commissions/regole-client";
import { IntestazionePagina } from "@/components/pagina/intestazione";
import { StatoVuoto } from "@/components/stati/stato-vuoto";
import { puoScrivere, RUOLI_COME_ADMIN } from "@/lib/auth/roles";
import { requireRuolo } from "@/lib/auth/session";
import { aggiungiMesi, oggiRoma, primoDelMeseISO } from "@/lib/date";
import { formato } from "@/lib/format";
import { getLingua } from "@/lib/i18n/server";
import { ETICHETTE } from "@/lib/i18n/testi/etichette";
import { IMPOSTAZIONI } from "@/lib/i18n/testi/impostazioni";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RegoleProvvigioniPage() {
  // the business coach reads the rules (22/10/2026): no new rule, no change, no close
  const profilo = await requireRuolo(RUOLI_COME_ADMIN);
  const scrive = puoScrivere(profilo.ruolo);
  const oggi = oggiRoma();
  const lingua = await getLingua();
  const T = IMPOSTAZIONI[lingua];
  const t = T.regole;
  const { formatData, formatPercentuale } = formato(lingua);
  const supabase = await createClient();

  const [{ data: regole, error }, { data: persone, error: errorePersone }] =
    await Promise.all([
      supabase
        .from("commission_rules")
        .select(
          "id, profile_id, percentuale, applica_a, valida_dal, valida_al, persona:profiles!commission_rules_profile_id_fkey(nome)",
        )
        .order("valida_dal", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, nome")
        .eq("attivo", true)
        .in("ruolo", ["setter", "closer"])
        .order("nome"),
    ]);
  if (error || errorePersone) throw new Error(t.errore);

  // icon + words like every other status in the app; colour only reinforces
  const stato = (r: {
    valida_dal: string;
    valida_al: string | null;
  }): { etichetta: string; Icona: LucideIcon; tono: string } =>
    r.valida_dal > oggi
      ? { etichetta: t.futura, Icona: Clock, tono: "text-muted-foreground" }
      : r.valida_al && r.valida_al < oggi
        ? {
            etichetta: t.chiusa,
            Icona: CircleMinus,
            tono: "text-muted-foreground",
          }
        : {
            etichetta: t.inVigore,
            Icona: CircleCheck,
            tono: "text-status-ok",
          };

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: "/settings", etichetta: T.titolo }}
        titolo={T.sezioni.commissions[0]}
        descrizione={t.descrizione}
        azione={
          scrive ? (
            <NuovaRegola
              persone={persone}
              dataPredefinita={aggiungiMesi(primoDelMeseISO(oggi), 1)}
            />
          ) : undefined
        }
      />

      {regole.length === 0 ? (
        <StatoVuoto
          Icona={Percent}
          titolo={t.vuoto}
          descrizione={t.vuotoDescrizione}
        />
      ) : (
        <ul
          className="divide-y divide-border rounded-xl bg-card"
          data-testid="regole"
        >
          {regole.map((r) => {
            const { etichetta, Icona, tono } = stato(r);
            return (
              <li key={r.id} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {r.persona?.nome} ·{" "}
                    <span className="num text-base font-semibold">
                      {formatPercentuale(r.percentuale)}
                    </span>
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm ${tono}`}
                  >
                    <Icona className="size-4 shrink-0" aria-hidden="true" />
                    {etichetta}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t.sullIncassato(
                    r.applica_a
                      .map((tipo) => ETICHETTE[lingua].tipoVendita[tipo].toLowerCase())
                      .join(", "),
                    formatData(r.valida_dal),
                    r.valida_al ? formatData(r.valida_al) : null,
                  )}
                </p>
                {scrive ? (
                  <div className="flex flex-wrap gap-2">
                    <ModificaRegola
                      regola={{
                        id: r.id,
                        // fraction -> points for the form (0.05 -> 5)
                        percentuale: Math.round(r.percentuale * 10000) / 100,
                        applica_a: r.applica_a,
                        valida_dal: r.valida_dal,
                        valida_al: r.valida_al,
                      }}
                      etichetta={`${r.persona?.nome ?? "Regola"} · ${formatPercentuale(r.percentuale)}`}
                    />
                    {!r.valida_al && r.valida_dal <= oggi ? (
                      <ChiudiRegola
                        ruleId={r.id}
                        oggi={oggi}
                        etichetta={`${r.persona?.nome ?? "Regola"} · ${formatPercentuale(r.percentuale)}`}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
