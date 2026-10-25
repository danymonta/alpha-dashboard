"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  GitMerge,
  LoaderCircle,
  Mail,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  cambiaAttivo,
  cambiaLivelloPm,
  cambiaRuolo,
  eliminaPersona,
  invita,
  reinviaInvito,
  revocaInvito,
  unisciProfili,
  type EsitoInvito,
} from "@/app/(app)/settings/team/actions";
import { Elimina } from "@/components/form/elimina";
import { ErroreCampo } from "@/components/form/errore-campo";
import { useLingua } from "@/components/i18n/lingua-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  ETICHETTA_LIVELLO_PM,
  ETICHETTA_RUOLO,
  type AppRole,
  type LivelloPm,
} from "@/lib/auth/roles";
import type { Lingua } from "@/lib/i18n/lingua";
import { traduciImpostazioni } from "@/lib/i18n/testi/impostazioni";
import { SHELL } from "@/lib/i18n/testi/shell";
import { TEAM } from "@/lib/i18n/testi/team";
import {
  LIVELLI_PM,
  RUOLI,
  invitoSchema,
  type InvitoInput,
} from "@/lib/validation/team";

/** The roles and the projects levels in the page's language (Italian: the labels of always). */
function etichette(lingua: Lingua) {
  return lingua === "it"
    ? { ruoli: ETICHETTA_RUOLO, livelli: ETICHETTA_LIVELLO_PM }
    : { ruoli: SHELL[lingua].ruoli, livelli: SHELL[lingua].livelliPm };
}

const selectClassi =
  "h-11 rounded-lg border border-input bg-input/30 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm";

/** Toast after an invite: sent by email, or the link to share by hand. */
function avvisaInvito(
  email: string,
  esito: EsitoInvito & { ok: true },
  urlLogin: string,
  lingua: Lingua,
) {
  const t = TEAM[lingua];
  const copia = {
    label: t.copiaLink,
    onClick: () =>
      void navigator.clipboard
        ?.writeText(urlLogin)
        .then(() => toast.success(t.linkCopiato)),
  };
  if (esito.email === "inviata") {
    toast.success(t.invitoInviato(email), {
      description: t.invitoInviatoDescrizione,
    });
  } else if (esito.email === "errore") {
    toast.warning(t.emailNonPartita(email), {
      description: t.emailNonPartitaDescrizione,
      action: copia,
    });
  } else {
    toast.success(t.invitoPronto(email), {
      description: t.invitoProntoDescrizione,
      action: copia,
    });
  }
}

export function InvitaMembro({
  urlLogin,
  emailAttiva,
}: {
  urlLogin: string;
  emailAttiva: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const lingua = useLingua();
  const t = TEAM[lingua];
  const { ruoli } = etichette(lingua);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitoInput>({
    resolver: zodResolver(invitoSchema),
    defaultValues: { email: "", ruolo: "setter" },
  });

  const invia = handleSubmit(async (valori) => {
    setErrore(null);
    let esito;
    try {
      esito = await invita(valori);
    } catch {
      setErrore(SHELL[lingua].connessione);
      return;
    }
    if (!esito.ok) {
      setErrore(traduciImpostazioni(esito.errore, lingua));
      return;
    }
    avvisaInvito(valori.email, esito, urlLogin, lingua);
    setAperto(false);
    reset();
  });

  return (
    <Sheet
      open={aperto}
      onOpenChange={(v) => {
        setAperto(v);
        if (!v) setErrore(null);
      }}
    >
      <SheetTrigger render={<Button type="button" className="h-11" />}>
        <UserPlus className="size-4" aria-hidden="true" />
        {t.invita}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.invitaTitolo}</SheetTitle>
          <SheetDescription>
            {emailAttiva
              ? t.invitaDescrizioneEmail
              : t.invitaDescrizioneLink(urlLogin)}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="i-email">{t.emailGoogle}</Label>
            <Input
              id="i-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              className="h-11"
              {...register("email")}
            />
            <ErroreCampo
              id="i-email-errore"
              messaggio={traduciImpostazioni(errors.email?.message, lingua)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-ruolo">{t.ruolo}</Label>
            <select
              id="i-ruolo"
              className={`${selectClassi} w-full`}
              {...register("ruolo")}
            >
              {RUOLI.map((r) => (
                <option key={r} value={r}>
                  {ruoli[r]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t.ruoloAiuto}</p>
          </div>
          {errore ? (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-status-critical"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {errore}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {emailAttiva ? t.inviaInvito : t.creaInvito}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type Conferma =
  | { tipo: "admin"; precedente: AppRole }
  | { tipo: "admin_pm"; precedente: LivelloPm }
  | { tipo: "disattiva" };

/**
 * Role, projects level and active switch of one member. Your own row is
 * read-only (DB guard too). Making someone admin (of the app or of the
 * projects) and deactivating ask first; other changes apply at once with an
 * undo in the toast; reactivating needs no confirmation. The app admin is
 * always projects admin, so their level is locked.
 */
export function ControlliMembro({
  profileId,
  nome,
  ruolo,
  livelloPm,
  attivo,
  sonoIo,
  altri,
}: {
  profileId: string;
  nome: string;
  ruolo: AppRole;
  livelloPm: LivelloPm;
  attivo: boolean;
  sonoIo: boolean;
  /** The other people, to merge this profile into one of them. */
  altri: { id: string; nome: string; email: string }[];
}) {
  const [inCorso, avvia] = useTransition();
  // the select shows the chosen role while the dialog is open, and goes back on cancel
  const [valore, setValore] = useState<AppRole>(ruolo);
  const [livello, setLivello] = useState<LivelloPm>(livelloPm);
  // kept after closing, so the dialog text does not change while it fades out
  const [conferma, setConferma] = useState<Conferma>({ tipo: "disattiva" });
  const [chiedi, setChiedi] = useState(false);
  const lingua = useLingua();
  const t = TEAM[lingua];
  const { ruoli, livelli } = etichette(lingua);

  function apriConferma(c: Conferma) {
    setConferma(c);
    setChiedi(true);
  }

  function applicaRuolo(
    nuovo: AppRole,
    precedente: AppRole,
    annullabile: boolean,
  ) {
    setValore(nuovo);
    avvia(async () => {
      const esito = await cambiaRuolo({ profile_id: profileId, ruolo: nuovo });
      if (!esito.ok) {
        setValore(precedente);
        toast.error(traduciImpostazioni(esito.errore, lingua));
        return;
      }
      toast.success(
        t.oraRuolo(nome, ruoli[nuovo].toLowerCase()),
        annullabile
          ? {
              action: {
                label: t.annulla,
                onClick: () => applicaRuolo(precedente, nuovo, false),
              },
            }
          : undefined,
      );
    });
  }

  function applicaLivello(
    nuovo: LivelloPm,
    precedente: LivelloPm,
    annullabile: boolean,
  ) {
    setLivello(nuovo);
    avvia(async () => {
      const esito = await cambiaLivelloPm({
        profile_id: profileId,
        livello_pm: nuovo,
      });
      if (!esito.ok) {
        setLivello(precedente);
        toast.error(traduciImpostazioni(esito.errore, lingua));
        return;
      }
      toast.success(
        t.oraLivello(nome, livelli[nuovo].toLowerCase()),
        annullabile
          ? {
              action: {
                label: t.annulla,
                onClick: () => applicaLivello(precedente, nuovo, false),
              },
            }
          : undefined,
      );
    });
  }

  function applicaAttivo(v: boolean) {
    avvia(async () => {
      const esito = await cambiaAttivo({ profile_id: profileId, attivo: v });
      if (esito.ok)
        toast.success(v ? t.riattivato(nome) : t.disattivato(nome));
      else toast.error(traduciImpostazioni(esito.errore ?? t.nonRiuscita, lingua));
    });
  }

  function annulla() {
    if (conferma.tipo === "admin") setValore(conferma.precedente);
    if (conferma.tipo === "admin_pm") setLivello(conferma.precedente);
    setChiedi(false);
  }

  function confermaAzione() {
    if (conferma.tipo === "admin")
      applicaRuolo("admin", conferma.precedente, false);
    else if (conferma.tipo === "admin_pm")
      applicaLivello("admin", conferma.precedente, false);
    else applicaAttivo(false);
    setChiedi(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor={`ruolo-${profileId}`}>
        {t.ruoloDi(nome)}
      </label>
      <select
        id={`ruolo-${profileId}`}
        value={valore}
        disabled={sonoIo || inCorso}
        className={selectClassi}
        onChange={(e) => {
          const nuovo = e.currentTarget.value as AppRole;
          if (nuovo === valore) return;
          if (nuovo === "admin") {
            setValore(nuovo);
            apriConferma({ tipo: "admin", precedente: valore });
          } else {
            applicaRuolo(nuovo, valore, true);
          }
        }}
      >
        {RUOLI.map((r) => (
          <option key={r} value={r}>
            {ruoli[r]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`livello-pm-${profileId}`}>
        {t.livelloDi(nome)}
      </label>
      <select
        id={`livello-pm-${profileId}`}
        // the app admin is projects admin whatever livello_pm says
        value={valore === "admin" ? "admin" : livello}
        disabled={sonoIo || valore === "admin" || inCorso}
        title={
          valore === "admin"
            ? t.adminSempre
            : undefined
        }
        className={selectClassi}
        onChange={(e) => {
          const nuovo = e.currentTarget.value as LivelloPm;
          if (nuovo === livello) return;
          if (nuovo === "admin") {
            setLivello(nuovo);
            apriConferma({ tipo: "admin_pm", precedente: livello });
          } else {
            applicaLivello(nuovo, livello, true);
          }
        }}
      >
        {LIVELLI_PM.map((l) => (
          <option key={l} value={l}>
            {t.progetti(livelli[l])}
          </option>
        ))}
      </select>
      <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={attivo}
          disabled={sonoIo || inCorso}
          aria-label={t.attivoDi(nome)}
          onCheckedChange={(v) =>
            v ? applicaAttivo(true) : apriConferma({ tipo: "disattiva" })
          }
        />
        {attivo ? t.attivo : t.statoDisattivato}
      </label>
      {inCorso ? (
        <LoaderCircle
          className="size-4 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
      {sonoIo ? null : (
        <div className="flex">
          <UnisciProfilo profileId={profileId} nome={nome} altri={altri} />
          <Elimina
            variante="icona"
            etichetta={t.eliminaDalTeam}
            cosa={nome}
            fatto={t.eliminato(nome)}
            anteprima={{ tipo: "persona", id: profileId }}
            azione={() => eliminaPersona({ profile_id: profileId })}
          />
        </div>
      )}

      <Dialog
        open={chiedi}
        onOpenChange={(aperto) => {
          if (!aperto) annulla();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {conferma.tipo === "disattiva"
                ? t.domandaDisattiva(nome)
                : conferma.tipo === "admin_pm"
                  ? t.domandaAdminPm(nome)
                  : t.domandaAdmin(nome)}
            </DialogTitle>
            <DialogDescription>
              {conferma.tipo === "disattiva"
                ? t.spiegaDisattiva
                : conferma.tipo === "admin_pm"
                  ? t.spiegaAdminPm
                  : t.spiegaAdmin}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={annulla}
            >
              {SHELL[lingua].annulla}
            </Button>
            <Button
              type="button"
              variant={
                conferma.tipo === "disattiva" ? "destructive" : "default"
              }
              className="h-11"
              onClick={confermaAzione}
            >
              {conferma.tipo === "disattiva"
                ? t.disattiva
                : conferma.tipo === "admin_pm"
                  ? t.rendiAdminPm
                  : t.rendiAdmin}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RevocaInvito({
  email,
  urlLogin,
}: {
  email: string;
  urlLogin: string;
}) {
  const [inCorso, avvia] = useTransition();
  const lingua = useLingua();
  const t = TEAM[lingua];
  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        disabled={inCorso}
        aria-label={t.rimandaInvito(email)}
        onClick={() =>
          avvia(async () => {
            const esito = await reinviaInvito({ email });
            if (esito.ok) avvisaInvito(email, esito, urlLogin, lingua);
            else toast.error(traduciImpostazioni(esito.errore, lingua));
          })
        }
      >
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mail className="size-4" aria-hidden="true" />
        )}
      </Button>
      <Elimina
        variante="icona"
        etichetta={t.eliminaInvitoA}
        cosa={email}
        fatto={t.invitoEliminato(email)}
        conseguenze={[t.invitoConseguenza]}
        azione={() => revocaInvito({ email })}
      />
    </div>
  );
}

/** Two profiles of the same person become one: e.g. "Loris (da collegare)" into the real Loris. */
function UnisciProfilo({
  profileId,
  nome,
  altri,
}: {
  profileId: string;
  nome: string;
  altri: { id: string; nome: string; email: string }[];
}) {
  const [aperto, setAperto] = useState(false);
  const [destinazione, setDestinazione] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();
  const scelto = altri.find((a) => a.id === destinazione);
  const lingua = useLingua();
  const t = TEAM[lingua];

  function conferma() {
    setErrore(null);
    avvia(async () => {
      const esito = await unisciProfili({ da: profileId, a: destinazione });
      if (!esito.ok) {
        setErrore(traduciImpostazioni(esito.errore, lingua));
        return;
      }
      toast.success(t.unito(nome, scelto?.nome ?? ""));
      setAperto(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label={t.unisciNome(nome)}
        title={t.unisciTitle}
        onClick={() => {
          setAperto(true);
          setDestinazione("");
          setErrore(null);
        }}
      >
        <GitMerge className="size-4" aria-hidden="true" />
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.unisciDomanda(nome)}</DialogTitle>
            <DialogDescription>{t.unisciSpiegazione(nome)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`unisci-${profileId}`}>{t.unisciA}</Label>
            <select
              id={`unisci-${profileId}`}
              className={`${selectClassi} w-full`}
              value={destinazione}
              onChange={(e) => setDestinazione(e.currentTarget.value)}
            >
              <option value="">{t.scegliPersona}</option>
              {altri.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} · {a.email}
                </option>
              ))}
            </select>
          </div>
          {errore ? (
            <p role="alert" className="text-sm text-status-critical">
              {errore}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={inCorso}
              onClick={() => setAperto(false)}
            >
              {SHELL[lingua].annulla}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={!destinazione || inCorso}
              onClick={conferma}
            >
              {inCorso ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <GitMerge className="size-4" aria-hidden="true" />
              )}
              {t.unisci}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
