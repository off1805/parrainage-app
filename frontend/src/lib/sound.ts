// Ambiance : dépose ton fichier dans public/audio/ambiance.mp3 (titre de ton choix, non fourni).
let ctx: AudioContext | null = null;
let amb: HTMLAudioElement | null = null;

export const sound = {
  on: false,
  unlock() { ctx ??= new AudioContext(); void ctx.resume(); },
  set(on: boolean) {
    sound.on = on;
    if (!amb) { amb = new Audio('/audio/ambiance.mp3'); amb.loop = true; amb.volume = 0.35; }
    if (on) void amb.play().catch(() => {}); else amb.pause();
  },
  chime() {
    if (!ctx || !sound.on) return;
    const t = ctx.currentTime;
    [880, 1318.5, 1760].forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g).connect(ctx!.destination); o.start(t); o.stop(t + 1.9);
    });
  },
};
