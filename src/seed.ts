import { Exercise, Program, State, Workout } from './model';

type Seed = [string, string, Exercise['muscle'], Exercise['pattern'], Exercise['equipment'], Exercise['mode']?, boolean?];
const entries: Seed[] = [
  ['db-bench', 'Flat dumbbell chest press', 'Chest', 'Horizontal push', 'Dumbbell'],
  ['chest-press', 'Vertical chest press machine', 'Chest', 'Horizontal push', 'Machine'],
  ['incline-press', 'Incline dumbbell chest press', 'Chest', 'Horizontal push', 'Dumbbell'],
  ['incline-machine', 'Incline chest press machine', 'Chest', 'Horizontal push', 'Machine'],
  ['pullover', 'Bumper plate pullover', 'Back', 'Vertical pull', 'Plate'],
  ['pec-deck', 'Butterfly / pec-deck machine', 'Chest', 'Horizontal push', 'Machine'],
  ['push-up', 'Push-up', 'Chest', 'Horizontal push', 'Bodyweight', 'reps'],
  ['plate-press', 'Standing plate press', 'Chest', 'Horizontal push', 'Plate'],
  ['supported-row', 'Chest-supported seated row', 'Back', 'Horizontal pull', 'Machine'],
  ['db-row', 'Single-arm dumbbell row', 'Back', 'Horizontal pull', 'Dumbbell', 'weight', true],
  ['pulldown', 'Lat pulldown', 'Back', 'Vertical pull', 'Machine'],
  ['assisted-pullup', 'Assisted pull-up', 'Back', 'Vertical pull', 'Machine'],
  ['hyperextension', 'Hyperextension', 'Back', 'Hinge', 'Bodyweight', 'reps'],
  ['good-morning', 'Bumper plate good morning', 'Hamstrings', 'Hinge', 'Plate'],
  ['plate-row', 'Bent-over plate row', 'Back', 'Horizontal pull', 'Plate'],
  ['plank', 'Plank', 'Core', 'Core', 'Bodyweight', 'seconds'],
  ['shoulder-tap', 'Shoulder tap', 'Core', 'Core', 'Bodyweight', 'reps', true],
  ['halo', 'Kettlebell halo', 'Shoulders', 'Mobility', 'Kettlebell'],
  ['ytw', 'YTW exercise', 'Shoulders', 'Mobility', 'Bodyweight', 'reps'],
  ['arnold', 'Arnold press', 'Shoulders', 'Vertical push', 'Dumbbell'],
  ['lateral', 'Dumbbell lateral raise', 'Shoulders', 'Shoulder isolation', 'Dumbbell'],
  ['military', 'Military shoulder press', 'Shoulders', 'Vertical push', 'Barbell'],
  ['front-raise', 'Standing plate front raise', 'Shoulders', 'Shoulder isolation', 'Plate'],
  ['shrug', 'Dumbbell shrug', 'Back', 'Shoulder isolation', 'Dumbbell'],
  ['db-shoulder', 'Seated dumbbell shoulder press', 'Shoulders', 'Vertical push', 'Dumbbell'],
  ['reverse-fly', 'Chest-supported dumbbell reverse fly', 'Shoulders', 'Shoulder isolation', 'Dumbbell'],
  ['triceps', 'Dumbbell overhead triceps extension', 'Triceps', 'Elbow extension', 'Dumbbell'],
  ['skull', 'Dumbbell skull crusher', 'Triceps', 'Elbow extension', 'Dumbbell'],
  ['curl', 'Dumbbell biceps curl', 'Biceps', 'Elbow flexion', 'Dumbbell'],
  ['hammer', 'Hammer curl', 'Biceps', 'Elbow flexion', 'Dumbbell'],
  ['leg-press', 'Leg press', 'Quads', 'Squat', 'Machine'],
  ['ham-curl', 'Hamstring curl', 'Hamstrings', 'Knee flexion', 'Machine'],
  ['leg-extension', 'Leg extension', 'Quads', 'Knee extension', 'Machine'],
  ['squat', 'Bodyweight squat', 'Quads', 'Squat', 'Bodyweight', 'reps'],
  ['barbell-squat', 'Barbell squat', 'Quads', 'Squat', 'Barbell'],
  ['sumo', 'Sumo squat', 'Glutes', 'Squat', 'Dumbbell'],
  ['lunge', 'Lunge', 'Quads', 'Single leg', 'Dumbbell', 'weight', true],
  ['reverse-lunge', 'Reverse lunge', 'Quads', 'Single leg', 'Dumbbell', 'weight', true],
  ['calf', 'Standing calf raise', 'Calves', 'Calf raise', 'Machine'],
  ['pike', 'Pike push-up', 'Shoulders', 'Vertical push', 'Bodyweight', 'reps'],
  ['scapular', 'Scapular push-up', 'Back', 'Mobility', 'Bodyweight', 'reps'],
  ['pass-through', 'Dumbbell pass-through', 'Shoulders', 'Mobility', 'Dumbbell'],
  ['beast', 'Beast hold', 'Core', 'Core', 'Bodyweight', 'seconds'],
  ['beast-rotation', 'Beast hold rotation', 'Core', 'Core', 'Bodyweight', 'reps', true],
  ['crunch', 'Crunch', 'Core', 'Core', 'Bodyweight', 'reps'],
  ['scissors', 'Leg scissors', 'Core', 'Core', 'Bodyweight', 'reps'],
  ['v-hold', 'V-hold', 'Core', 'Core', 'Bodyweight', 'seconds'],
  ['superman', 'Superman', 'Back', 'Core', 'Bodyweight', 'reps'],
  ['bridge', 'Glute bridge', 'Glutes', 'Hinge', 'Dumbbell'],
  ['russian', 'Russian twist', 'Core', 'Core', 'Bodyweight', 'reps', true],
  ['rdl', 'Dumbbell Romanian deadlift', 'Hamstrings', 'Hinge', 'Dumbbell'],
  ['smith', 'Smith-machine squat', 'Quads', 'Squat', 'Smith machine'],
  ['dead-bug', 'Dead bug', 'Core', 'Core', 'Bodyweight', 'reps', true],
  ['side-plank', 'Side plank', 'Core', 'Core', 'Bodyweight', 'seconds', true],
  ['walking', 'Brisk / incline walking', 'Full body', 'Cardio', 'Cardio machine', 'cardio'],
  ['cycling', 'Stationary cycling', 'Full body', 'Cardio', 'Cardio machine', 'cardio'],
  ['elliptical', 'Elliptical', 'Full body', 'Cardio', 'Cardio machine', 'cardio'],
  ['running', 'Running', 'Full body', 'Cardio', 'Cardio machine', 'cardio'],
  ['stairs', 'Stair climber', 'Full body', 'Cardio', 'Cardio machine', 'cardio'],
  ['hip-stretch', 'Hip-flexor stretch', 'Glutes', 'Mobility', 'Bodyweight', 'seconds', true],
  ['calf-stretch', 'Calf stretch', 'Calves', 'Mobility', 'Bodyweight', 'seconds', true],
  ['thoracic', 'Upper-back rotation', 'Back', 'Mobility', 'Bodyweight', 'reps', true],
];
const cues: Record<string, string> = {
  rdl: 'Soft knees. Hips back. Keep the weights close and stop before your back position changes.',
  smith: 'Set safety stops and use a comfortable stance. Have your setup checked before loading.',
  'leg-press': 'Keep your hips against the pad. Use a controlled, comfortable depth.',
  'dead-bug': 'Move slowly. Only reach as far as you can without your lower back lifting.',
  plank: 'Keep ribs and pelvis stacked. End the set before your position deteriorates.',
  'reverse-lunge': 'Start without added load if needed. Record repetitions per leg.',
  'db-bench': 'Use a comfortable range. Record the weight of ONE dumbbell.',
};
export const defaultExercises: Exercise[] = entries.map(([id, name, muscle, pattern, equipment, mode = 'weight', perSide = false]) => ({
  id, name, muscle, pattern, equipment, mode, perSide, notes: cues[id] ?? '',
}));
type Rx = [string, number, number, number?, number?];
function workout(id: string, name: string, subtitle: string, color: string, minutes: number, prescriptions: Rx[]): Workout {
  return {
    id, name, subtitle, color, minutes,
    exercises: prescriptions.map(([exerciseId, sets, min, max = min, rest = 90], index) => ({
      id: `${id}-${index}`, exerciseId, sets, min, max, rest,
    })),
  };
}
export const defaultWorkouts: Workout[] = [
  workout('upper-a', 'Upper body A', 'Press, pull & shoulders', '#C7F36B', 65, [
    ['db-bench', 3, 8, 12, 150], ['supported-row', 3, 8, 12, 150], ['pulldown', 2, 8, 12, 120],
    ['db-shoulder', 2, 8, 12, 120], ['lateral', 2, 12, 20], ['curl', 2, 10, 15], ['triceps', 2, 10, 15],
  ]),
  workout('lower-a', 'Lower body A', 'Quads, hinge & core', '#B4A0FF', 65, [
    ['leg-press', 3, 8, 12, 150], ['rdl', 3, 8, 10, 150], ['ham-curl', 2, 10, 15],
    ['leg-extension', 2, 10, 15], ['calf', 3, 12, 20], ['plank', 2, 20, 40, 60],
  ]),
  workout('conditioning', 'Conditioning & core', 'Steady cardio, trunk & mobility', '#73D9E7', 65, [
    ['walking', 1, 2100, 2400, 0], ['crunch', 2, 10, 15, 45], ['side-plank', 2, 20, 30, 45],
    ['beast', 2, 20, 30, 45], ['hip-stretch', 1, 30, 45, 0], ['calf-stretch', 1, 30, 45, 0],
    ['thoracic', 1, 8, 10, 0], ['ytw', 1, 8, 10, 0],
  ]),
  workout('upper-b', 'Upper body B', 'Incline, back & arms', '#C7F36B', 70, [
    ['incline-press', 3, 8, 12, 150], ['supported-row', 3, 8, 12, 150], ['pulldown', 2, 8, 12, 120],
    ['pec-deck', 2, 10, 15], ['lateral', 2, 12, 20], ['reverse-fly', 2, 12, 20],
    ['hammer', 2, 10, 15], ['skull', 2, 10, 15],
  ]),
  workout('lower-b', 'Lower body B', 'Squat, single leg & glutes', '#B4A0FF', 65, [
    ['smith', 3, 8, 10, 150], ['reverse-lunge', 2, 8, 10, 120], ['ham-curl', 3, 10, 15],
    ['bridge', 2, 10, 15], ['calf', 3, 12, 20], ['dead-bug', 2, 6, 10, 60],
  ]),
  workout('easy', 'Easy movement', 'Optional cardio & mobility', '#F6BE83', 60, [
    ['cycling', 1, 2700, 2700, 0], ['hip-stretch', 2, 30, 45, 0],
    ['calf-stretch', 2, 30, 45, 0], ['thoracic', 2, 8, 10, 0],
  ]),
];
export const defaultPrograms: Program[] = [
  {
    id: 'foundation', name: 'The Foundation', subtitle: '4 strength + 1 conditioning + optional movement',
    slots: ['upper-a', 'lower-a', 'conditioning', 'upper-b', 'lower-b', 'easy'].map((workoutId, i) => ({
      id: `foundation-${i}`, workoutId, day: (i + 1) % 7,
    })),
  },
  {
    id: 'strength', name: 'Strength essentials', subtitle: 'The same workouts. A different week.',
    slots: ['upper-a', 'lower-a', 'upper-b', 'lower-b'].map((workoutId, i) => ({
      id: `strength-${i}`, workoutId, day: [1, 2, 4, 5][i]!,
    })),
  },
];
export function seedState(): State {
  return {
    schemaVersion: 1, exercises: defaultExercises, workouts: defaultWorkouts, programs: defaultPrograms,
    sessions: [], active: null,
    settings: { programId: 'foundation', returnMode: true, weeklyGoal: 5, lastExportAt: null, notifications: false },
  };
}
