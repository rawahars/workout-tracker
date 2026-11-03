let context: AudioContext | undefined;

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
  try {
    for (let index = 0; index < 3; index++) {
      const start = audio.currentTime + index * 0.24;
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = index === 1 ? 660 : 880;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + 0.18);
    }
    return true;
  } catch { return false; }
}
