import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Tone = { frequency: { value: number }; onended: (() => void) | null };
let tones: Tone[];
let mode: string;
let changes: string[];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  tones = []; mode = 'auto'; changes = [];
  class FixtureAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    createOscillator() {
      const tone = { frequency: { value: 0 }, type: 'sine', onended: null as (() => void) | null, connect() {}, disconnect() {}, start() {}, stop() {} };
      tones.push(tone);
      return tone;
    }
  }
  vi.stubGlobal('window', { AudioContext: FixtureAudioContext });
  vi.stubGlobal('navigator', { audioSession: { get type() { return mode; }, set type(value: string) { mode = value; changes.push(value); } } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('brief playback-mode alarms', () => {
  it('does not request exclusive playback until the chime, and restores the original mode when it ends', async () => {
    const alarm = await import('../src/alarm.web');
    expect(await alarm.unlockAlarm()).toBe(true);
    expect(changes).toEqual([]);
    expect(alarm.ringAlarm()).toBe(true);
    expect(mode).toBe('playback');
    const audible = tones.filter(tone => tone.frequency.value > 0);
    audible[0]!.onended!(); audible[1]!.onended!();
    expect(mode).toBe('playback');
    audible[2]!.onended!();
    expect(mode).toBe('auto');
    expect(changes).toEqual(['playback', 'auto']);
  });
  it('keeps playback mode until overlapping chimes have both completed', async () => {
    const alarm = await import('../src/alarm.web');
    await alarm.unlockAlarm();
    alarm.ringAlarm(); alarm.ringAlarm();
    const audible = tones.filter(tone => tone.frequency.value > 0);
    audible.slice(0, 3).forEach(tone => tone.onended!());
    expect(mode).toBe('playback');
    audible.slice(3).forEach(tone => tone.onended!());
    expect(mode).toBe('auto');
  });
  it('restores audio mode if ended events are interrupted, and falls back without the Audio Session API', async () => {
    const alarm = await import('../src/alarm.web');
    await alarm.unlockAlarm();
    alarm.ringAlarm();
    vi.advanceTimersByTime(1500);
    expect(mode).toBe('auto');
    vi.stubGlobal('navigator', {});
    expect(alarm.ringAlarm()).toBe(true);
  });
});
