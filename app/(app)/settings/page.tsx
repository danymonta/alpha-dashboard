import {
  ChevronRight,
  Download,
  FolderKanban,
  History,
  KeyRound,
  MessagesSquare,
  Package,
  Percent,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { VoceNovita } from "@/components/changelog/voce-novita";
import { IntestazionePagina } from "@/components/pagina/intestazione";
import { RUOLI_COME_ADMIN, solaLettura } from "@/lib/auth/roles";
import { requireRuolo } from "@/lib/auth/session";
import { getLingua } from "@/lib/i18n/server";
import { IMPOSTAZIONI } from "@/lib/i18n/testi/impostazioni";

export const dynamic = "force-dynamic";

type Testi = (typeof IMPOSTAZIONI)["it"];

/**
 * The words of a section are the dictionary's (IMPOSTAZIONI.sezioni), by its key.
 * `lettura`: the business coach opens it too, in read only (22/10/2026).
 */
type Sezione = {
  href: string;
  chiave: keyof Testi["sezioni"];
  Icona: LucideIcon;
  lettura?: boolean;
};

/**
 * The settings by category (1.38.0, Dany 16/10/2026): who is in the team, what
 * is sold and paid, the keys of the outside services, the data out, the
 * projects. The addresses are the same as before.
 */
const GRUPPI: { gruppo: keyof Testi["gruppi"]; sezioni: Sezione[] }[] = [
  {
    gruppo: "team",
    sezioni: [
      {
        href: "/settings/team",
        chiave: "team",
        Icona: Users,
        lettura: true,
      },
    ],
  },
  {
    gruppo: "prodotti",
    sezioni: [
      {
        href: "/settings/products",
        chiave: "products",
        Icona: Package,
        lettura: true,
      },
      {
        href: "/settings/commissions",
        chiave: "commissions",
        Icona: Percent,
        lettura: true,
      },
    ],
  },
  {
    gruppo: "chiavi",
    sezioni: [
      {
        href: "/settings/chiavi",
        chiave: "chiavi",
        Icona: KeyRound,
      },
      {
        href: "/settings/instagram",
        chiave: "instagram",
        Icona: MessagesSquare,
      },
      {
        href: "/settings/fathom",
        chiave: "fathom",
        Icona: Video,
      },
    ],
  },
  {
    gruppo: "esporta",
    sezioni: [
      {
        href: "/settings/export",
        chiave: "export",
        Icona: Download,
      },
      {
        href: "/settings/audit",
        chiave: "audit",
        Icona: History,
        lettura: true,
      },
    ],
  },
  {
    gruppo: "progetti",
    sezioni: [
      {
        href: "/settings/progetti",
        chiave: "progetti",
        Icona: FolderKanban,
      },
    ],
  },
];

export default async function ImpostazioniPage() {
  const profilo = await requireRuolo(RUOLI_COME_ADMIN);
  // the business coach: team, products, commission rules and the audit log, in read only;
  // never keys, connections, export, backup or project templates (22/10/2026)
  const leggeSolo = solaLettura(profilo.ruolo);
  const t = IMPOSTAZIONI[await getLingua()];
  const gruppi = GRUPPI.map((g) => ({
    ...g,
    sezioni: g.sezioni.filter((s) => !leggeSolo || s.lettura),
  })).filter((g) => g.sezioni.length > 0);

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={leggeSolo ? t.soloLettura : undefined}
      />
      {gruppi.map(({ gruppo, sezioni }) => {
        // the id stays the Italian one: links and tests do not change with the language
        const id = `gruppo-${IMPOSTAZIONI.it.gruppi[gruppo].toLowerCase().replaceAll(" ", "-")}`;
        const titolo = t.gruppi[gruppo];
        return (
          <section key={gruppo} aria-labelledby={id} className="space-y-2">
            <h2
              id={id}
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {titolo}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sezioni.map(({ href, chiave, Icona }) => {
                const [nome, descrizione] = t.sezioni[chiave];
                return (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex min-h-20 items-center gap-3 rounded-xl bg-card p-4 hover:bg-accent"
                  >
                    <Icona
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{nome}</span>
                      <span className="block text-sm text-muted-foreground">
                        {descrizione}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* the app itself: which version is live and what changed (CLAUDE.md section 23) */}
      <VoceNovita
        testId="voce-changelog"
        descrizione={t.changelog}
      />
    </div>
  );
}
