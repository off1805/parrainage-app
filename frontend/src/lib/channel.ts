import { createClient } from '@supabase/supabase-js';

export interface Cmd { type: 'next' | 'prev' | 'reset' | 'sound' | 'finale' | 'sync' }
export interface ShowState { index: number; total: number; sound: boolean; stage: string }
interface Handlers { onCmd?: (c: Cmd) => void; onState?: (s: ShowState) => void }

// Télécommande : Supabase Realtime (broadcast). Sans clés, repli sur BroadcastChannel (même navigateur, pour tester).
export function openRoom(room: string, h: Handlers) {
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) {
    const sb = createClient(url, key);
    const ch = sb.channel(`parrainage:${room}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'cmd' }, ({ payload }) => h.onCmd?.(payload as Cmd))
      .on('broadcast', { event: 'state' }, ({ payload }) => h.onState?.(payload as ShowState))
      .subscribe();
    return {
      sendCmd: (c: Cmd) => void ch.send({ type: 'broadcast', event: 'cmd', payload: c }),
      sendState: (s: ShowState) => void ch.send({ type: 'broadcast', event: 'state', payload: s }),
      close: () => void sb.removeChannel(ch),
    };
  }
  const bc = new BroadcastChannel(`parrainage:${room}`);
  bc.onmessage = (e) => (e.data.k === 'cmd' ? h.onCmd?.(e.data.p) : h.onState?.(e.data.p));
  return {
    sendCmd: (c: Cmd) => bc.postMessage({ k: 'cmd', p: c }),
    sendState: (s: ShowState) => bc.postMessage({ k: 'state', p: s }),
    close: () => bc.close(),
  };
}
