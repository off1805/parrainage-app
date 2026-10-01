import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { openRoom, type Cmd, type ShowState } from '../lib/channel';

export default function Remote() {
  const [p] = useSearchParams();
  const room = p.get('room') ?? localStorage.getItem('room') ?? '';
  const [st, setSt] = useState<ShowState | null>(null);
  const r = useRef<ReturnType<typeof openRoom>>();

  useEffect(() => {
    if (!room) return;
    r.current = openRoom(room, { onState: setSt });
    const t = setTimeout(() => r.current?.sendCmd({ type: 'sync' }), 1000);
    return () => { clearTimeout(t); r.current?.close(); };
  }, [room]);

  const send = (type: Cmd['type']) => { navigator.vibrate?.(15); r.current?.sendCmd({ type }); };
  if (!room) return <div className="center"><p className="lead">Code de salle manquant. Ouvre le lien affiché sur l'écran du show.</p></div>;

  return (
    <div className="remote">
      <span className="script">Télécommande</span>
      <p className="lead">{st ? (st.stage === 'finale' ? 'Grand tableau' : `${st.index} / ${st.total} couples`) : 'Connexion…'}</p>
      <button className="big-btn" onClick={() => send('next')}>Suivant</button>
      <div className="row">
        <button onClick={() => send('prev')}>← Précédent</button>
        <button onClick={() => send('finale')}>Grand tableau</button>
      </div>
      <div className="row">
        <button onClick={() => send('sound')}>Son : {st?.sound ? 'oui' : 'non'}</button>
        <button onClick={() => confirm('Rejouer depuis le début ?') && send('reset')}>Rejouer</button>
      </div>
    </div>
  );
}
