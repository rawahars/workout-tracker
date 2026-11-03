import { z } from 'zod';

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1).max(100);
const text = z.string().max(4000);
const number = z.number().finite().nonnegative();
export const muscles = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full body'] as const;
export const modes = ['weight', 'reps', 'seconds', 'cardio'] as const;
export const patterns = ['Horizontal push', 'Vertical push', 'Horizontal pull', 'Vertical pull', 'Squat', 'Hinge', 'Single leg', 'Knee flexion', 'Knee extension', 'Calf raise', 'Shoulder isolation', 'Elbow flexion', 'Elbow extension', 'Core', 'Mobility', 'Cardio'] as const;
export const equipmentTypes = ['Dumbbell', 'Machine', 'Barbell', 'Smith machine', 'Bodyweight', 'Plate', 'Kettlebell', 'Cardio machine'] as const;

export const ExerciseSchema = z.object({
  id, name, muscle: z.enum(muscles), pattern: z.enum(patterns),
  equipment: z.enum(equipmentTypes), mode: z.enum(modes),
  perSide: z.boolean().default(false), notes: text.default(''),
  image: id.optional(), videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
  videoTitle: z.string().max(300).optional(), videoFetchedAt: number.optional(),
  videoSource: z.enum(['manual', 'automatic']).optional(),
  hideDefaultVideo: z.boolean().optional(),
});
export const PrescriptionSchema = z.object({
  id, exerciseId: id, sets: z.number().int().min(1).max(12),
  min: z.number().int().min(1).max(3600), max: z.number().int().min(1).max(3600),
  rest: z.number().int().min(0).max(600),
}).refine(value => value.max >= value.min, 'Maximum must be at least minimum');
export const WorkoutSchema = z.object({
  id, name, subtitle: z.string().max(150), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  minutes: z.number().int().min(5).max(240), exercises: z.array(PrescriptionSchema).max(60),
});
export const ProgramSchema = z.object({
  id, name, subtitle: z.string().max(150),
  slots: z.array(z.object({ id, workoutId: id, day: z.number().int().min(0).max(6) })).max(40),
});
export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDay(date) === value;
}
export function localDay(date: Date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const DaySchema = z.string().refine(validDay, 'Invalid date');
export const SetSchema = z.object({
  id, weight: number.max(2000), reps: number.int().max(1000),
  seconds: number.max(86400), distance: number.max(1000), done: z.boolean(),
});
export const SessionExerciseSchema = z.object({
  id, exerciseId: id, name, muscle: z.enum(muscles), mode: z.enum(modes),
  perSide: z.boolean(), target: z.string().max(100), rest: number.max(600),
  sets: z.array(SetSchema).max(30),
});
export const MetricsSchema = z.object({
  source: z.enum(['manual', 'import', 'google-health']),
  averageHeartRate: z.number().min(25).max(250).optional(),
  maxHeartRate: z.number().min(25).max(250).optional(),
  steps: number.int().max(100000).optional(),
  providerWorkoutId: z.string().max(300).optional(),
  providerStartTime: z.string().datetime({ offset: true }).optional(),
  providerEndTime: z.string().datetime({ offset: true }).optional(),
  syncedAt: number.optional(),
}).refine(value => !value.averageHeartRate || !value.maxHeartRate || value.maxHeartRate >= value.averageHeartRate, 'Maximum heart rate must be at least average');
export const SessionSchema = z.object({
  id, name, day: DaySchema, startedAt: number,
  endedAt: number.optional(), duration: number.max(86400).optional(),
  workoutId: id.optional(), programId: id.optional(), programName: z.string().max(100).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i), notes: text,
  exercises: z.array(SessionExerciseSchema).max(100),
  restEndsAt: number.optional(), metrics: MetricsSchema.optional(),
});
export const StateSchema = z.object({
  schemaVersion: z.literal(1),
  exercises: z.array(ExerciseSchema).min(1).max(2000),
  workouts: z.array(WorkoutSchema).max(500),
  programs: z.array(ProgramSchema).max(100),
  sessions: z.array(SessionSchema).max(20000),
  active: SessionSchema.nullable(),
  settings: z.object({
    programId: id.nullable(), returnMode: z.boolean(), weeklyGoal: z.number().int().min(1).max(7),
    lastExportAt: number.nullable(), notifications: z.boolean(),
  }),
}).superRefine((state, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) fail(`Duplicate ${label}`); };
  unique(state.exercises.map(x => x.id), 'exercise IDs');
  unique(state.workouts.map(x => x.id), 'workout IDs');
  unique(state.programs.map(x => x.id), 'program IDs');
  unique([...state.sessions.map(x => x.id), ...(state.active ? [state.active.id] : [])], 'session IDs');
  const exercises = new Set(state.exercises.map(x => x.id));
  const workouts = new Set(state.workouts.map(x => x.id));
  if (state.settings.programId && !state.programs.some(x => x.id === state.settings.programId)) fail('Active program is missing');
  state.workouts.forEach(workout => {
    unique(workout.exercises.map(x => x.id), 'prescription IDs');
    workout.exercises.forEach(x => { if (!exercises.has(x.exerciseId)) fail('Workout exercise is missing'); });
  });
  state.programs.forEach(program => {
    unique(program.slots.map(x => x.id), 'slot IDs');
    program.slots.forEach(x => { if (!workouts.has(x.workoutId)) fail('Program workout is missing'); });
  });
  [...state.sessions, ...(state.active ? [state.active] : [])].forEach(session => {
    unique(session.exercises.map(x => x.id), 'session exercise IDs');
    session.exercises.forEach(x => {
      if (!exercises.has(x.exerciseId)) fail('Session exercise is missing');
      unique(x.sets.map(set => set.id), 'set IDs');
      x.sets.forEach(set => {
        if (set.done && (x.mode === 'weight' || x.mode === 'reps' ? set.reps <= 0 : set.seconds <= 0)) fail('A completed set is missing repetitions or duration');
      });
    });
    if (session.endedAt !== undefined && session.endedAt < session.startedAt) fail('Session ends before it starts');
  });
  if (state.sessions.some(x => x.endedAt === undefined || x.duration === undefined || !x.exercises.some(e => e.sets.some(s => s.done)))) fail('Invalid completed session');
  if (state.active?.endedAt !== undefined) fail('Active session is already complete');
});

export type Exercise = z.infer<typeof ExerciseSchema>;
export type Prescription = z.infer<typeof PrescriptionSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type LoggedSet = z.infer<typeof SetSchema>;
export type SessionExercise = z.infer<typeof SessionExerciseSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type State = z.infer<typeof StateSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type Tab = 'Today' | 'Routines' | 'Calendar' | 'Explore' | 'Progress';
