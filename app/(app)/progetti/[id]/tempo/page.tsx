import { Timer } from "lucide-react";

import { AggiornaConTempo } from "@/components/pm/tempo/aggiorna-con-tempo";
import { AvviaTimer } from "@/components/pm/tempo/avvia-timer";
import {
  ElencoTempo,
  type VoceTempo,
} from "@/components/pm/tempo/elenco-tempo";
import {
  EliminaTempo,
  ModificaTempo,
  NuovoTempo,
  type OpzioneTask,
  type VoceModificabile,
} from "@/components/pm/tempo/form-tempo";
import { NavigazionePeriodo } from "@/components/pm/tempo/navigazione-periodo";
import { livelloPmEffettivo } from "@/lib/auth/roles";
import { requireProfilo } from "@/lib/auth/session";
import { oggiRoma } from "@/lib/date";
import { formato } from "@/lib/format";
import { getLingua } from "@/lib/i18n/server";
import { TEMPO_PROGETTO } from "@/lib/i18n/testi/tempo";
import { createClient } from "@/lib/supabase/server";
import { formatDurata, periodoTempo } from "@/lib/tempo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parametri = { settimana?: string; da?: string; a?: string };

/**
 * Time spent on a project, as far as RLS shows it: an employee sees their own
 * time, who manages the project and the admin see everyone's. Only what was
 * declared: no list of who did not log, no alerts (CLAUDE.md section 17), and
 * no running timers of others.
 */
export default async function TempoProgettoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Parametri>;
}) {
  const profilo = await requireProfilo();
  const { id } = await params;
  // the layout shows "Progetto non trovato"
  if (!UUID.test(id)) return null;

  const oggi = oggiRoma();
  const lingua = await getLingua();
  const t = TEMPO_PROGETTO[lingua];
  const { formatData } = formato(lingua);
  const periodo = periodoTempo(await searchParams, oggi, lingua);
  const percorso = `/progetti/${id}/tempo`;
  const supabase = await createClient();

  const [progetto, gestisce, task, voci, riepilogo] = await Promise.all([
    supabase.from("pm_progetti").select("id, nome").eq("id", id).maybeSingle(),
    supabase.rpc("pm_puo_gestire", { p_progetto: id }),
    supabase
      .from("pm_task")
      .select("id, titolo, progetto_id, stato")
      .eq("progetto_id", id)
      .order("ordine")
      .order("titolo"),
    supabase
      .from("pm_tempo")
      .select(
        "id, profile_id, data, inizio, fine, minuti, nota, progetto_id, task_id, persona:profiles!pm_tempo_profile_id_fkey(nome), task:pm_task(titolo)",
      )
      .eq("progetto_id", id)
      .not("minuti", "is", null)
      .gte("data", periodo.da)
      .lte("data", periodo.a)
      .order("data", { ascending: false })
      .order("inizio", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.rpc("pm_tempo_progetto", {
      p_progetto: id,
      p_da: periodo.da,
      p_a: periodo.a,
    }),
  ]);
  if (
    progetto.error ||
    gestisce.error ||
    task.error ||
    voci.error ||
    riepilogo.error
  ) {
    throw new Error(t.errore);
  }
  if (!progetto.data) return null;

  const puoGestire = gestisce.data === true;
  const adminPm =
    livelloPmEffettivo(profilo.ruolo, profilo.livello_pm) === "admin";
  const opzioniProgetti = [{ id: progetto.data.id, nome: progetto.data.nome }];
  const opzioniTask: OpzioneTask[] = task.data.map((t) => ({
    id: t.id,
    titolo: t.titolo,
    progetto_id: t.progetto_id,
    completato: t.stato === "completato",
  }));

  const totale =
    riepilogo.data.find((r) => r.livello === "totale")?.minuti ?? 0;
  const totaliGiorno = new Map(
    riepilogo.data
      .filter((r) => r.livello === "giorno")
      .map((r) => [r.data!, r.minuti]),
  );
  const perPersona = riepilogo.data.filter((r) => r.livello === "persona");
  const perTask = riepilogo.data.filter((r) => r.livello === "task");

  const elenco: (VoceTempo & VoceModificabile & { mia: boolean })[] =
    voci.data.map((v) => ({
      id: v.id,
      data: v.data,
      inizio: v.inizio,
      fine: v.fine,
      minuti: v.minuti!,
      nota: v.nota,
      titolo:
        v.profile_id === profilo.id
          ? t.tu
          : (v.persona?.nome ?? t.collaboratore),
      dettaglio: v.task?.titolo ?? null,
      progetto_id: v.progetto_id,
      nomeProgetto: progetto.data!.nome,
      task_id: v.task_id,
      daTimer: v.inizio !== null,
      mia: v.profile_id === profilo.id,
    }));

  return (
    <div className="space-y-6">
      <AggiornaConTempo />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NavigazionePeriodo
          percorso={percorso}
          periodo={periodo}
          oggi={oggi}
          lingua={lingua}
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t.timerSulProgetto}
          </span>
          <AvviaTimer
            progettoId={id}
            titolo={progetto.data.nome}
            lingua={lingua}
          />
        </div>
      </div>

      {!puoGestire ? (
        <p className="text-sm text-muted-foreground">
          {t.soloTuo}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-card p-4" data-testid="totale-progetto">
          <p className="text-xs text-muted-foreground">
            {puoGestire ? t.tempoSulProgetto : t.ilTuoTempo} ·{" "}
            {periodo.titolo.toLowerCase()}
          </p>
          <p className="num text-3xl font-semibold">{formatDurata(totale)}</p>
        </div>

        {puoGestire ? (
          <Riepilogo
            titolo={t.perPersona}
            vuoto={t.ancoraNiente}
            righe={perPersona.map((r) => ({
              chiave: r.profile_id ?? "nessuno",
              etichetta:
                r.profile_id === profilo.id
                  ? t.tu
                  : (r.persona ?? t.collaboratore),
              minuti: r.minuti,
            }))}
          />
        ) : null}

        <Riepilogo
          titolo={t.perAttivita}
          vuoto={t.ancoraNiente}
          righe={perTask.map((r) => ({
            chiave: r.task_id ?? "senza",
            etichetta: r.task_id
              ? (r.task ?? t.attivita)
              : t.senzaAttivita,
            minuti: r.minuti,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section aria-labelledby="titolo-voci" className="space-y-2">
          <h2 id="titolo-voci" className="sr-only">
            {t.giornoPerGiorno}
          </h2>
          {elenco.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <Timer
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">{t.vuoto}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t.vuotoDescrizione}
              </p>
              <a
                href="#registra-progetto"
                className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
              >
                {t.registraPassato}
              </a>
            </div>
          ) : (
            <ElencoTempo
              voci={elenco}
              totaliGiorno={totaliGiorno}
              oggi={oggi}
              lingua={lingua}
              azioni={(voce) => {
                const completa = elenco.find((e) => e.id === voce.id)!;
                if (!completa.mia && !adminPm) return null;
                const descrizione = t.descrizioneVoce(
                  completa.mia,
                  voce.titolo,
                  formatData(voce.data),
                );
                return (
                  <>
                    <ModificaTempo
                      voce={completa}
                      progetti={opzioniProgetti}
                      task={opzioniTask}
                      oggi={oggi}
                      descrizione={descrizione}
                      progettoFisso
                      lingua={lingua}
                    />
                    <EliminaTempo
                      id={voce.id}
                      descrizione={descrizione}
                      lingua={lingua}
                    />
                  </>
                );
              }}
            />
          )}
        </section>

        <section
          id="registra-progetto"
          aria-labelledby="titolo-registra-progetto"
          className="scroll-mt-24 space-y-2"
        >
          <h2
            id="titolo-registra-progetto"
            className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {t.registraPassato}
          </h2>
          <NuovoTempo
            progetti={opzioniProgetti}
            task={opzioniTask}
            oggi={oggi}
            progettoId={id}
            lingua={lingua}
          />
        </section>
      </div>
    </div>
  );
}

function Riepilogo({
  titolo,
  vuoto,
  righe,
}: {
  titolo: string;
  vuoto: string;
  righe: { chiave: string; etichetta: string; minuti: number }[];
}) {
  return (
    <div className="rounded-xl bg-card p-4">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      {righe.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{vuoto}</p>
      ) : (
        <dl className="mt-2 space-y-1.5">
          {righe.map((r) => (
            <div
              key={r.chiave}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <dt className="min-w-0 truncate">{r.etichetta}</dt>
              <dd className="num shrink-0 font-medium">
                {formatDurata(r.minuti)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
