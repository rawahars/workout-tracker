import { z } from 'zod';
import { State, StateSchema } from './model';
import { imageData, saveImage } from './platform';

export const BackupSchema = z.object({
  app: z.literal('FORM'), version: z.literal(1), createdAt: z.string().datetime(),
  state: StateSchema,
  images: z.record(z.string().regex(/^[a-zA-Z0-9_-]+$/), z.string().max(3_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)),
}).superRefine((backup, ctx) => {
  backup.state.exercises.forEach(exercise => {
    if (exercise.image && !backup.images[exercise.image]) ctx.addIssue({ code: 'custom', message: `Missing image for ${exercise.name}` });
  });
});
export type Backup = z.infer<typeof BackupSchema>;
export async function createBackup(state: State): Promise<Backup> {
  const images: Record<string, string> = {};
  for (const exercise of state.exercises) {
    if (!exercise.image || images[exercise.image]) continue;
    const data = await imageData(exercise.image);
    if (!data) throw new Error(`The image for ${exercise.name} is missing. Replace it before exporting.`);
    images[exercise.image] = data;
  }
  return BackupSchema.parse({ app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images });
}
export function parseBackup(text: string): Backup {
  if (text.length > 60 * 1024 * 1024) throw new Error('This backup exceeds the 60 MB limit.');
  try { return BackupSchema.parse(JSON.parse(text)); }
  catch { throw new Error('This is not a valid FORM v1 backup. Nothing has been changed.'); }
}
export async function prepareRestore(backup: Backup): Promise<State> {
  // New image IDs preserve the current library if restoration fails before the final snapshot write.
  const suffix = Date.now().toString(36);
  const images = new Map<string, string>();
  for (const [id, data] of Object.entries(backup.images)) {
    const newId = `restored_${suffix}_${images.size}`;
    await saveImage(newId, data);
    images.set(id, newId);
  }
  return {
    ...backup.state,
    exercises: backup.state.exercises.map(e => e.image ? { ...e, image: images.get(e.image)! } : e),
  };
}
