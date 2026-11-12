import {
  ChevronRight,
  Download,
  FolderKanban,
  History,
  KeyRound,
  MessagesSquare,
  Package,
  Percent,
  Rocket,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { VoceNovita } from "@/components/changelog/voce-novita";
import { IntestazionePagina } from "@/components/pagina/intestazione";
import { requireRuolo } from "@/lib/auth/session";
import { getLingua } from "@/lib/i18n/server";
import { IMPOSTAZIONI } from "@/lib/i18n/testi/impostazioni";

export const dynamic = "force-dynamic";

type Testi = (typeof IMPOSTAZIONI)["it"];

/**
 * The words of a section are the dictionary's (IMPOSTAZIONI.sezioni), by its key.
 */
type Sezione = {
  href: string;
  chiave: keyof Testi["sezioni"];
  Icona: LucideIcon;
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
      },
      {
        href: "/settings/commissions",
        chiave: "commissions",
        Icona: Percent,
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
      // 1.77.0: the people the wizard «Nuovo cliente» proposes, the community, the link's days
      {
        href: "/settings/onboarding",
        chiave: "onboarding",
        Icona: Rocket,
      },
    ],
  },
];

export default async function ImpostazioniPage() {
  await requireRuolo(["admin"]);
  const t = IMPOSTAZIONI[await getLingua()];

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina titolo={t.titolo} />
      {GRUPPI.map(({ gruppo, sezioni }) => {
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
