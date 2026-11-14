/**
 * What the «i» of the questionnaire says about the exercises of the maximums and the equipment (Dany, 14/11/2026:
 * «se uno non conosce l'esercizio… ti dice esattamente quale esercizio è»). Italian only, like the client's area.
 */

export const ESERCIZI_INFO = ['piegamenti', 'trazioni', 'dip'] as const
export type Esercizio = (typeof ESERCIZI_INFO)[number]

export const ATTREZZI = ['sbarra', 'elastici', 'manubri', 'anelli', 'parallele'] as const
export type Attrezzo = (typeof ATTREZZI)[number]

export const INFO_ESERCIZI: Record<Esercizio, { nome: string; testo: string }> = {
  piegamenti: {
    nome: 'Piegamenti',
    testo:
      'A terra, mani poco più larghe delle spalle e corpo dritto dalla testa ai talloni. Scendi finché il petto quasi tocca terra, poi risali a braccia tese. Conta quelli fatti di fila così.',
  },
  trazioni: {
    nome: 'Trazioni',
    testo:
      'Appeso alla sbarra con le braccia tese, tiri su finché il mento supera la sbarra, poi torni giù fino a braccia tese. Conta solo quelle complete, senza slanci.',
  },
  dip: {
    nome: 'Dip',
    testo:
      'Mani sulle parallele (o su due sedie stabili), braccia tese. Scendi piegando i gomiti finché le spalle arrivano all’altezza dei gomiti, poi risali a braccia tese.',
  },
}

export const INFO_ATTREZZI: Record<Attrezzo, { nome: string; testo: string }> = {
  sbarra: {
    nome: 'Sbarra',
    testo: 'Una barra fissata in alto, di solito nel telaio di una porta o al muro. Serve per le trazioni e per stare appesi.',
  },
  elastici: {
    nome: 'Elastici',
    testo: 'Bande elastiche di diversa resistenza. Ti aiutano nelle trazioni e rendono più duri altri esercizi.',
  },
  manubri: {
    nome: 'Manubri',
    testo: 'Pesi da tenere in mano, fissi o con i dischi da cambiare.',
  },
  anelli: {
    nome: 'Anelli',
    testo: 'Due anelli appesi con le cinghie, a una sbarra, a una trave o a un albero. Si usano per trazioni, dip e rematori.',
  },
  parallele: {
    nome: 'Parallele',
    testo: 'Due impugnature parallele: basse (le parallettes, da terra) o alte. Servono per dip e piegamenti più profondi.',
  },
}
