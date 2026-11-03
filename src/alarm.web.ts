let context: AudioContext | undefined;
type AudioSession = { type: string };
let playbackSession: AudioSession | undefined;
let previousType = 'auto';
let playbackUsers = 0;

function acquirePlayback(): () => void {
  try {
    const session = (navigator as unknown as { audioSession?: AudioSession }).audioSession;
    if (!session) return () => {};
    if (!playbackUsers) {
      previousType = session.type;
      session.type = 'playback';
      playbackSession = session;
    }
    playbackUsers++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      playbackUsers--;
      if (!playbackUsers && playbackSession) {
        try { if (playbackSession.type === 'playback') playbackSession.type = previousType; } catch {}
        playbackSession = undefined;
      }
    };
  } catch { return () => {}; }
}

export function alarmReady() { return context?.state === 'running'; }
export async function unlockAlarm(): Promise<boolean> {
  try {
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return false;
    if (!context || context.state === 'closed') context = new Constructor();
    const resumed = context.resume();
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 0; gain.gain.value = 0;
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.01);
    await resumed;
    return alarmReady();
  } catch { return false; }
}
export function ringAlarm(): boolean {
  if (!context || !alarmReady()) return false;
  const audio = context;
  const release = acquirePlayback();
  let remaining = 3;
  try {
    for (let index = 0; index < 3; index++) {
      const start = audio.currentTime + 0.05 + index * 0.24;
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = index === 1 ? 660 : 880;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = () => {
        oscillator.disconnect(); gain.disconnect();
        if (--remaining === 0) release();
      };
      oscillator.start(start); oscillator.stop(start + 0.18);
    }
    setTimeout(release, 1500);
    return true;
  } catch { release(); return false; }
}
