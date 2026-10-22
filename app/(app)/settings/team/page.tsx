import {
  ControlliMembro,
  InvitaMembro,
  RevocaInvito,
} from "@/app/(app)/settings/team/team-client";
import { IntestazionePagina } from "@/components/pagina/intestazione";
import {
  ETICHETTA_RUOLO,
  puoScrivere,
  RUOLI_COME_ADMIN,
} from "@/lib/auth/roles";
import { requireRuolo } from "@/lib/auth/session";
import { oggiRoma } from "@/lib/date";
import { emailConfigurata } from "@/lib/email/invia";
import { origineCorrente } from "@/lib/auth/origine-server";
import { formatData } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  // the business coach reads the team (22/10/2026): no invite, no role change, no revoke
  const io = await requireRuolo(RUOLI_COME_ADMIN);
  const scrive = puoScrivere(io.ruolo);
  // the link to share by hand points to the domain the admin is on
  const urlLogin = `${await origineCorrente()}/login`;
  const supabase = await createClient();

  const [{ data: membri, error }, { data: inviti, error: erroreInviti }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, nome, email, ruolo, livello_pm, attivo")
        .order("attivo", { ascending: false })
        .order("nome"),
      supabase
        .from("invites")
        .select("email, ruolo, created_at")
        .is("usato_at", null)
        .eq("revocato", false)
        .order("created_at", { ascending: false }),
    ]);
  if (error || erroreInviti) throw new Error("Impossibile caricare il team");

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: "/settings", etichetta: "Impostazioni" }}
        titolo="Team"
        descrizione="Accesso solo su invito. Chi è disattivato non entra più e non vede nessun dato."
        azione={
          scrive ? (
            <InvitaMembro
              urlLogin={urlLogin}
              emailAttiva={emailConfigurata()}
            />
          ) : undefined
        }
      />

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Membri ({membri.length})
        </h2>
        <ul
          className="divide-y divide-border rounded-xl bg-card"
          data-testid="membri"
        >
          {membri.map((m) => (
            <li
              key={m.id}
              aria-label={m.nome}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.nome}
                  {m.id === io.id ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · sei tu
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {m.email}
                </p>
              </div>
              {scrive ? (
                <ControlliMembro
                  profileId={m.id}
                  nome={m.nome}
                  ruolo={m.ruolo}
                  livelloPm={m.livello_pm}
                  attivo={m.attivo}
                  sonoIo={m.id === io.id}
                  altri={membri
                    .filter((x) => x.id !== m.id)
                    .map((x) => ({ id: x.id, nome: x.nome, email: x.email }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {ETICHETTA_RUOLO[m.ruolo]}
                  {m.attivo ? "" : " · disattivato"}
                </p>
              )}
            </li>
          ))}
        </ul>
        {scrive ? (
          <p className="px-1 text-xs text-muted-foreground">
            Il tuo account non si disattiva e non perde il ruolo admin: lo
            impedisce il database. Il livello progetti vale solo nell’area
            Progetti; l’admin dell’app ne è sempre admin.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Inviti in attesa ({inviti.length})
        </h2>
        {inviti.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Nessun invito in attesa. Chi riceve un invito compare tra i membri
            al primo accesso.
          </p>
        ) : (
          <ul
            className="divide-y divide-border rounded-xl bg-card"
            data-testid="inviti"
          >
            {inviti.map((i) => (
              <li
                key={i.email}
                aria-label={i.email}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ETICHETTA_RUOLO[i.ruolo]} · invitato il{" "}
                    {formatData(oggiRoma(new Date(i.created_at)))}
                  </p>
                </div>
                {scrive ? (
                  <RevocaInvito email={i.email} urlLogin={urlLogin} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
