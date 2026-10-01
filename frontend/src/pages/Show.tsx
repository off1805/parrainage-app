import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { api } from '../lib/api';
import { demoPairings } from '../lib/demo';
import { openRoom, type Cmd } from '../lib/channel';
import { sound } from '../lib/sound';
import type { Pairing } from '../lib/types';
import { CardBack, Portrait, PersonCard } from '../components/PersonCard';
import { Mosaic } from '../components/Mosaic';

type Stage = 'loading' | 'error' | 'intro' | 'show' | 'finale';

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const GOLD = ['#B39058', '#7B1E4D', '#E9DCC6'];

export default function Show() {
  const [params] = useSearchParams();
  const room = useMemo(() => {
    const q = params.get('room'); if (q) return q;
    let r = localStorage.getItem('room');
    if (!r) { r = Math.random().toString(36).slice(2, 7); localStorage.setItem('room', r); }
    return r;
  }, [params]);

  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Pairing[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(2); // 0 parrain · 1 tirage · 2 révélé
  const [soundOn, setSoundOn] = useState(false);
  const [reel, setReel] = useState('');
  const quiet = useRef(false);
  const live = useRef({ index, phase, stage, total: 0, soundOn });
  live.current = { index, phase, stage, total: order.length, soundOn };
  const roomRef = useRef<ReturnType<typeof openRoom>>();

  useEffect(() => {
    (async () => {
      try {
        let list: Pairing[];
        if (params.get('demo')) list = demoPairings();
        else {
          let id = params.get('session');
          if (!id) {
            const s = (await api.sessions.list()).find((x) => x.status !== 'DRAFT');
            if (!s) throw new Error("Aucune session générée. Lance le tirage depuis le backend (generate).");
            id = s.id;
          }
          list = (await api.sessions.get(id)).pairings;
        }
        if (!list.length) throw new Error('Cette session ne contient aucun couple.');
        list.forEach((p) => [p.sponsor, p.mentee].forEach((s) => { if (s.profilePictureUrl) new Image().src = s.profilePictureUrl; }));
        setOrder(shuffle(list)); setStage('intro');
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); setStage('error'); }
    })();
  }, [params]);

  const start = () => {
    sound.unlock(); document.documentElement.requestFullscreen?.().catch(() => {});
    setStage('show');
  };
  const next = useCallback(() => {
    const s = live.current;
    if (s.stage !== 'show') return;
    if (s.index > 0 && s.phase < 2) return setPhase(2);
    if (s.index >= s.total) return setStage('finale');
    setIndex(s.index + 1); setPhase(0);
  }, []);
  const prev = useCallback(() => {
    const s = live.current;
    if (s.stage === 'finale') return setStage('show');
    if (s.index === 0) return;
    quiet.current = true; setIndex(s.index - 1); setPhase(2);
  }, []);
  const reset = useCallback(() => { setOrder((o) => shuffle(o)); setIndex(0); setPhase(2); setStage('show'); }, []);
  const toggleSound = useCallback(() => { sound.set(!live.current.soundOn); setSoundOn((v) => !v); }, []);
  const exec = useCallback((c: Cmd) => {
    if (c.type === 'next') next(); else if (c.type === 'prev') prev(); else if (c.type === 'reset') reset();
    else if (c.type === 'finale') setStage('finale'); else if (c.type === 'sound') toggleSound();
    else roomRef.current?.sendState({ index: live.current.index, total: live.current.total, sound: live.current.soundOn, stage: live.current.stage });
  }, [next, prev, reset, toggleSound]);
  const execRef = useRef(exec); execRef.current = exec;

  useEffect(() => { roomRef.current = openRoom(room, { onCmd: (c) => execRef.current(c) }); return () => roomRef.current?.close(); }, [room]);
  useEffect(() => { roomRef.current?.sendState({ index, total: order.length, sound: soundOn, stage }); }, [index, order.length, soundOn, stage]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev(); else if (e.key.toLowerCase() === 'r') reset();
      else if (e.key.toLowerCase() === 'm') toggleSound(); else if (e.key.toLowerCase() === 'f') setStage('finale');
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [next, prev, reset, toggleSound]);

  useEffect(() => {
    if (stage !== 'show' || index === 0 || phase === 2) return;
    let t = 0, iv = 0;
    if (phase === 0) t = window.setTimeout(() => setPhase(1), 1600);
    else {
      const pool = order.map((p) => `${p.mentee.firstName} ${p.mentee.lastName}`);
      iv = window.setInterval(() => setReel(pool[Math.floor(Math.random() * pool.length)]), 90);
      t = window.setTimeout(() => setPhase(2), 2400);
    }
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [stage, index, phase, order]);

  useEffect(() => {
    if (stage !== 'show' || index === 0 || phase !== 2) return;
    if (quiet.current) { quiet.current = false; return; }
    sound.chime();
    confetti({ particleCount: 70, spread: 75, origin: { y: 0.6 }, colors: GOLD, scalar: 0.9 });
  }, [phase, index, stage]);
  useEffect(() => {
    if (stage !== 'finale') return;
    sound.chime();
    const end = Date.now() + 2500;
    (function f() {
      confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 }, colors: GOLD });
      confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 }, colors: GOLD });
      if (Date.now() < end) requestAnimationFrame(f);
    })();
  }, [stage]);

  if (stage === 'loading') return <div className="center"><span className="script big">Parrainage</span><p className="lead">Chargement…</p></div>;
  if (stage === 'error') return <div className="center"><span className="script big">Oups</span><p className="lead">{error}</p></div>;
  if (stage === 'intro') return (
    <div className="center">
      <span className="script big">Parrainage</span>
      <p className="lead">{order.length} couples prêts à être dévoilés</p>
      <button className="big-btn" onClick={start}>Lever le rideau</button>
      <p className="hint">Télécommande : <b>{location.origin}/remote?room={room}</b><br />Clavier : Espace suivant · ← retour · M son · F tableau · R rejouer</p>
    </div>
  );
  if (stage === 'finale') return (
    <main className="stage finale">
      <span className="script big">Le grand tableau</span>
      <Mosaic pairings={order} />
    </main>
  );

  const cur = index > 0 ? order[index - 1] : null;
  const total = cur ? order.filter((p) => p.sponsor.id === cur.sponsor.id).length : 0;
  const nth = cur ? order.slice(0, index).filter((p) => p.sponsor.id === cur.sponsor.id).length : 0;
  const done = order.slice(0, index - (phase < 2 ? 1 : 0)).reverse();

  return (
    <main className="stage">
      <header className="top">
        <span className="script">Parrainage</span>
        <span className="count">{String(index).padStart(2, '0')}<i> / {order.length}</i></span>
      </header>
      {!cur ? (
        <div className="idle"><em>Et maintenant…</em><small>Appuyez sur suivant</small></div>
      ) : (
        <div className="duo" key={cur.id}>
          <motion.div initial={{ opacity: 0, x: -70 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}>
            <PersonCard s={cur.sponsor} role="Parrain" note={total > 1 ? `Filleul ${nth} sur ${total}` : undefined} />
          </motion.div>
          <motion.div className="amp" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: phase >= 1 ? 1 : 0, scale: 1 }}>&amp;</motion.div>
          <div className="slot">
            <AnimatePresence mode="wait">
              {phase < 2 ? (
                <motion.div key="back" initial={{ opacity: 0, x: 70 }} animate={{ opacity: phase >= 1 ? 1 : 0.35, x: 0 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.6 }}>
                  <CardBack text={phase === 1 ? reel : ''} />
                </motion.div>
              ) : (
                <motion.div key="front" initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
                  <PersonCard s={cur.mentee} role="Filleul" accent />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
      <footer className="rail">
        {done.map((p) => (
          <div className="mini" key={p.id} title={`${p.sponsor.firstName} & ${p.mentee.firstName}`}>
            <div className="arch sm"><Portrait s={p.sponsor} /></div><div className="arch sm"><Portrait s={p.mentee} /></div>
          </div>
        ))}
      </footer>
    </main>
  );
}
