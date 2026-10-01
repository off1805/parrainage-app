import type { StudentRef } from '../lib/types';

const TONES = ['#E6D5BD', '#DCC6B0', '#E9D3C4', '#D9C9D0', '#E3D9C2'];
const initials = (s: StudentRef) => `${s.firstName[0] ?? ''}${s.lastName[0] ?? ''}`.toUpperCase();

export function Portrait({ s }: { s: StudentRef }) {
  if (s.profilePictureUrl) return <img src={s.profilePictureUrl} alt="" />;
  const tone = TONES[(s.firstName.length + s.lastName.length) % TONES.length];
  return <span className="mono" style={{ background: `linear-gradient(160deg, ${tone}, #F2E8D8)` }}>{initials(s)}</span>;
}

export function PersonCard({ s, role, note, accent }: { s: StudentRef; role: string; note?: string; accent?: boolean }) {
  return (
    <figure className={`card ${accent ? 'accent' : ''}`}>
      <div className="arch"><Portrait s={s} /></div>
      <figcaption>
        <small>{role}</small>
        <h2>{s.firstName}<br /><em>{s.lastName}</em></h2>
        {note && <p className="note">{note}</p>}
      </figcaption>
    </figure>
  );
}

export function CardBack({ text }: { text: string }) {
  return (
    <figure className="card back">
      <div className="arch"><span className="reel">{text || '?'}</span></div>
      <figcaption><small>Filleul</small><h2><em>Qui sera-ce ?</em></h2></figcaption>
    </figure>
  );
}
