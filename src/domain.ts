import { Exercise, LoggedSet, Prescription, Session, SessionExercise, State, Workout, localDay } from './model';

let sequence = 0;
export const uid = () => `f_${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const emptySet = (): LoggedSet => ({ id: uid(), weight: 0, reps: 0, seconds: 0, distance: 0, done: false });
export const formatTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
export const fmt = (n: number) => Intl.NumberFormat('en', { maximumFractionDigits: 1, notation: n >= 10000 ? 'compact' : 'standard' }).format(n);
export const shortDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' });
export const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const completedSets = (session: Session) => session.exercises.reduce((total, e) => total + e.sets.filter(s => s.done).length, 0);
export const totalSets = (session: Session) => session.exercises.reduce((total, e) => total + e.sets.length, 0);
export const volume = (session: Session) => session.exercises.reduce((total, e) => total + (
  e.mode === 'weight' ? e.sets.reduce((sum, s) => sum + (s.done ? s.weight * s.reps : 0), 0) : 0
), 0);
export function targetFor(exercise: Exercise, rx?: Prescription) {
  if (!rx) return exercise.mode === 'cardio' ? '20 min' : exercise.mode === 'seconds' ? '20-40 sec' : '8-12 reps';
  const min = exercise.mode === 'cardio' ? Math.round(rx.min / 60) : rx.min;
  const max = exercise.mode === 'cardio' ? Math.round(rx.max / 60) : rx.max;
  const unit = exercise.mode === 'cardio' ? 'min' : exercise.mode === 'seconds' ? 'sec' : 'reps';
  return `${min}${max === min ? '' : `-${max}`} ${unit}${exercise.perSide ? ' / side' : ''}`;
}
export function previousSets(state: State, exerciseId: string): LoggedSet[] {
  const sessions = [...state.sessions].sort((a, b) => b.day.localeCompare(a.day) || b.startedAt - a.startedAt);
  for (const session of sessions) {
    const found = session.exercises.find(e => e.exerciseId === exerciseId && e.sets.some(s => s.done));
    if (found) return found.sets.filter(s => s.done);
  }
  return [];
}
export function sessionExercise(state: State, exercise: Exercise, rx?: Prescription): SessionExercise {
  const previous = previousSets(state, exercise.id);
  const count = rx ? (state.settings.returnMode ? Math.min(2, rx.sets) : rx.sets) : exercise.mode === 'cardio' ? 1 : 2;
  return {
    id: uid(), exerciseId: exercise.id, name: exercise.name, muscle: exercise.muscle,
    mode: exercise.mode, perSide: exercise.perSide, target: targetFor(exercise, rx), rest: rx?.rest ?? 90,
    sets: Array.from({ length: count }, (_, i) => ({
      ...emptySet(),
      weight: previous[i]?.weight ?? previous[0]?.weight ?? 0,
      reps: previous[i]?.reps ?? previous[0]?.reps ?? (exercise.mode === 'weight' || exercise.mode === 'reps' ? rx?.min ?? 8 : 0),
      seconds: previous[i]?.seconds ?? previous[0]?.seconds ?? (exercise.mode === 'seconds' || exercise.mode === 'cardio' ? rx?.min ?? (exercise.mode === 'cardio' ? 1200 : 20) : 0),
      distance: previous[i]?.distance ?? 0,
    })),
  };
}
export function startSession(state: State, workout?: Workout, day = localDay(), now = Date.now(), programId?: string): State {
  if (state.active) throw new Error('Finish or discard your current workout first.');
  const program = state.programs.find(p => p.id === programId);
  const session: Session = {
    id: uid(), name: workout?.name ?? 'Freestyle workout', day, startedAt: now,
    ...(workout ? { workoutId: workout.id } : {}),
    ...(program ? { programId: program.id, programName: program.name } : {}),
    color: workout?.color ?? '#F6BE83', notes: '',
    exercises: workout?.exercises.map(rx => {
      const exercise = state.exercises.find(e => e.id === rx.exerciseId);
      if (!exercise) throw new Error('An exercise is missing from this workout.');
      return sessionExercise(state, exercise, rx);
    }) ?? [],
  };
  return { ...state, active: session };
}
export function validateLoggedSet(exercise: SessionExercise, set: LoggedSet) {
  if (exercise.mode === 'weight' || exercise.mode === 'reps') {
    if (!Number.isInteger(set.reps) || set.reps <= 0) throw new Error('Enter repetitions before completing this set.');
  } else if (set.seconds <= 0) throw new Error('Enter a duration before completing this set.');
  if (set.weight < 0 || !Number.isFinite(set.weight)) throw new Error('Enter a valid load.');
}
export function finishSession(state: State, now = Date.now()): State {
  if (!state.active) throw new Error('There is no active workout.');
  if (!completedSets(state.active)) throw new Error('Complete at least one set before saving.');
  const session = {
    ...state.active, endedAt: now,
    duration: Math.min(86400, Math.max(0, Math.round((now - state.active.startedAt) / 1000))),
    restEndsAt: undefined,
  };
  return { ...state, sessions: [...state.sessions, session], active: null };
}
export function alternatives(state: State, exercise: Exercise) {
  return state.exercises.filter(e => e.id !== exercise.id && e.mode === exercise.mode && e.pattern === exercise.pattern && (
    e.muscle === exercise.muscle
  ));
}
export function weekStart(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}
export function weekDays(date = new Date()) {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(start); day.setDate(day.getDate() + i); return localDay(day); });
}
export function weeklySessions(state: State, date = new Date()) {
  const days = new Set(weekDays(date));
  return state.sessions.filter(s => days.has(s.day));
}
export function analyze(state: State) {
  const weekly = weeklySessions(state);
  const trainingDays = new Set(weekly.map(s => s.day)).size;
  const muscleSets = new Map<string, number>();
  weekly.forEach(s => s.exercises.forEach(e => {
    if (e.mode !== 'cardio') muscleSets.set(e.muscle, (muscleSets.get(e.muscle) ?? 0) + e.sets.filter(x => x.done).length);
  }));
  const records = state.exercises.flatMap(exercise => {
    if (exercise.mode !== 'weight') return [];
    const performances = state.sessions.flatMap(session => session.exercises.filter(e => e.exerciseId === exercise.id)
      .flatMap(e => e.sets.filter(s => s.done && s.reps > 0 && s.weight > 0).map(s => ({ weight: s.weight, reps: s.reps, day: session.day }))));
    if (!performances.length) return [];
    const best = performances.sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0]!;
    return [{ exercise, ...best }];
  });
  const insights: string[] = [];
  insights.push(`${trainingDays} of ${state.settings.weeklyGoal} training days completed this week.`);
  if (state.settings.returnMode) insights.push('Return mode is on: working sets are capped at two. Turn it off when you are recovering comfortably.');
  if (weekly.length) {
    const lastWeekDays = new Set(weekDays(new Date(Date.now() - 7 * 86400000)));
    const lastWeekVolume = state.sessions.filter(s => lastWeekDays.has(s.day)).reduce((sum, s) => sum + volume(s), 0);
    if (lastWeekVolume > 0) {
      const change = Math.round((weekly.reduce((sum, s) => sum + volume(s), 0) / lastWeekVolume - 1) * 100);
      insights.push(`Recorded load-volume is ${change >= 0 ? '+' : ''}${change}% versus the full previous week. Exercise selection and days completed affect this comparison.`);
    }
    if (trainingDays >= 5) insights.push('You have trained on five or more days this week. Keep the optional visit easy if fatigue is building.');
  } else insights.push('Log your first session to start tracking consistency, completed sets and load trends.');
  return { weekly, trainingDays, muscleSets: [...muscleSets].sort((a, b) => b[1] - a[1]), records, insights };
}
export function analysisSummary(state: State, selected?: Session) {
  const sessions = selected ? [selected] : [...state.sessions].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 10);
  return [
    'Review this training log for consistency and practical progression. Do not infer medical conditions, recovery status, calorie expenditure or muscle growth from these logs alone. Ask for missing context.',
    'Loads are recorded kg, consistently per dumbbell where applicable. Unilateral repetitions are per side. Unchecked sets are excluded. Load-volume is not comparable across different exercises or machines.',
    ...sessions.map(s => [
      `\n${s.day} | ${s.name} | ${Math.round((s.duration ?? 0) / 60)} min`,
      ...s.exercises.map(e => `${e.name}: ${e.sets.filter(x => x.done).map(x => e.mode === 'weight' ? `${x.weight} kg x ${x.reps}` : e.mode === 'reps' ? `${x.reps} reps` : `${x.seconds} sec${x.distance ? ` / ${x.distance} km` : ''}`).join(', ')}${e.perSide ? ' per side' : ''}`),
      s.metrics ? `${s.metrics.source === 'google-health' ? 'Imported Google Health metrics' : 'User-supplied metrics'}: ${JSON.stringify(s.metrics)}` : '',
      s.notes ? `Notes: ${s.notes}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n');
}
