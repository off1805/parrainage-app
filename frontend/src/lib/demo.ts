import type { Pairing, StudentRef } from './types';

const P = ['Amina', 'Brice', 'Clarisse', 'Dylan', 'Estelle', 'Fabrice', 'Grâce', 'Hervé', 'Inès', 'Jordan', 'Kelly', 'Landry', 'Mireille', 'Nadège', 'Orel', 'Prisca'];
const N = ['Mbarga', 'Tchouta', 'Ngono', 'Fotso', 'Essomba', 'Kamga', 'Nkoulou', 'Tagne', 'Owona', 'Djoumessi', 'Abena', 'Nana', 'Biyong', 'Ndzana', 'Kouam', 'Atangana'];
const mk = (i: number, k: string): StudentRef => ({
  id: `${k}${i}`, firstName: P[i % P.length], lastName: N[(i * 5 + 3) % N.length], email: `${k}${i}@demo.cm`,
  matricule: null, whatsapp: null, profilePictureUrl: null,
});

// 6 parrains (3,2,2,1,1,1 filleuls) → 10 couples, sans photo pour tester les monogrammes.
export function demoPairings(): Pairing[] {
  const counts = [3, 2, 2, 1, 1, 1]; let m = 0; const out: Pairing[] = [];
  counts.forEach((c, s) => { for (let j = 0; j < c; j++) out.push({ id: `p${m}`, origin: 'RANDOM', sponsor: mk(s, 's'), mentee: mk(m++ + 6, 'm') }); });
  return out;
}
