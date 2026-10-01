import type { Pairing, StudentRef } from '../lib/types';
import { Portrait } from './PersonCard';

export function Mosaic({ pairings }: { pairings: Pairing[] }) {
  const groups = new Map<string, { sponsor: StudentRef; mentees: StudentRef[] }>();
  pairings.forEach((p) => {
    const g = groups.get(p.sponsor.id) ?? { sponsor: p.sponsor, mentees: [] };
    g.mentees.push(p.mentee); groups.set(p.sponsor.id, g);
  });
  return (
    <div className="mosaic">
      {[...groups.values()].map(({ sponsor, mentees }) => (
        <section key={sponsor.id} className="group">
          <div className="who"><div className="arch sm"><Portrait s={sponsor} /></div><b>{sponsor.firstName}</b><span>{sponsor.lastName}</span></div>
          <i className="link">✦</i>
          <div className="kids">
            {mentees.map((m) => (
              <div key={m.id} className="who"><div className="arch sm"><Portrait s={m} /></div><b>{m.firstName}</b><span>{m.lastName}</span></div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
