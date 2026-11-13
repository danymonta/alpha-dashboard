import { describe, expect, it } from 'vitest'

import {
  campoDiProva,
  completaLezioneProva,
  segnaVideoLezioniProva,
  videoLezioneProva,
  type DatiCampoProva,
} from '@/lib/percorso/campo-prova'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ORA = new Date('2026-11-13T10:00:00Z')

const dati: DatiCampoProva = {
  home: [{ id: ID(90), tipo: 'testo', titolo: 'Benvenuto', corpo: 'Ciao', youtube_id: null, url: null, obbligatorio: false }],
  regole: [],
  regolePercorso: [],
  community: [],
  linkCommunity: 'https://t.me/esempio',
  coach: { nome: 'Coach Inventato', foto_url: null },
  aula: [
    {
      id: ID(1),
      titolo: 'Le basi',
      descrizione: null,
      copertina_url: null,
      icona: 'libro',
      stato: 'pubblicato',
      durante_onboarding: true,
      lezioni: [
        { id: ID(11), titolo: 'Leggi', tipo: 'testo', corpo: 'testo', youtube_id: null, url: null, obbligatoria: false },
        { id: ID(12), titolo: 'Guarda', tipo: 'video', corpo: null, youtube_id: 'dQw4w9WgXcQ', url: null, obbligatoria: true },
      ],
    },
    {
      id: ID(2),
      titolo: 'Dopo il lancio',
      descrizione: null,
      copertina_url: null,
      icona: 'stella',
      stato: 'pubblicato',
      durante_onboarding: false,
      lezioni: [{ id: ID(21), titolo: 'Avanti', tipo: 'testo', corpo: 'x', youtube_id: null, url: null, obbligatoria: false }],
    },
    {
      id: ID(3),
      titolo: 'In arrivo',
      descrizione: null,
      copertina_url: null,
      icona: 'mappa',
      stato: 'prossimamente',
      durante_onboarding: true,
      lezioni: [],
    },
  ],
}

describe('home base of the trial', () => {
  it('opens a module during the onboarding only when the admin says so, and never the content of a closed one', () => {
    const campo = campoDiProva(dati, {}, { lanciato: false, nome: 'Mario', giornoCheckup: '2026-11-10' })
    const [basi, dopo, arrivo] = campo.aula
    expect(basi!.aperto).toBe(true)
    expect(dopo!.aperto).toBe(false)
    expect(dopo!.lezioni[0]!.corpo).toBeNull()
    expect(arrivo!.stato).toBe('prossimamente')
    expect(campo.checkup).toHaveLength(1)
    expect(campo.checkup[0]).not.toHaveProperty('appunti')
    expect(campoDiProva(dati, {}, { lanciato: true, nome: 'Mario', giornoCheckup: '2026-11-10' }).aula[1]!.aperto).toBe(true)
  })

  it('completes a lesson that is not a video with a tap, once', () => {
    const r = completaLezioneProva(dati, {}, ID(11), false, ORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const di_nuovo = completaLezioneProva(dati, r.aula, ID(11), false, new Date('2026-11-14T10:00:00Z'))
    expect(di_nuovo.ok && di_nuovo.completataIl).toBe(r.completataIl)
    expect(completaLezioneProva(dati, {}, ID(12), false, ORA).ok).toBe(false)
    expect(completaLezioneProva(dati, {}, ID(21), false, ORA).ok).toBe(false)
  })

  it('completes a video lesson at 90%', () => {
    const meta = videoLezioneProva(dati, {}, { lezione: ID(12), durata: 100, intervalli: [[0, 50]] }, false, ORA)
    expect(meta.ok && meta.visto).toBe(false)
    if (!meta.ok) return
    const fine = videoLezioneProva(dati, meta.aula, { lezione: ID(12), durata: 100, intervalli: [[45, 95]] }, false, ORA)
    expect(fine.ok && fine.percentuale).toBe(95)
    expect(fine.ok && fine.visto).toBe(true)
    expect(videoLezioneProva(dati, {}, { lezione: ID(12), durata: 10, intervalli: [[0, 5]] }, false, ORA).ok).toBe(false)
  })

  it('«Segna il video come visto» completes the open video lessons only', () => {
    const aula = segnaVideoLezioniProva(dati, {}, false, ORA)
    expect(aula[ID(12)]?.completataIl).toBe(ORA.toISOString())
    expect(aula[ID(11)]).toBeUndefined()
  })
})
