import { z } from 'zod';
import { MetricsSchema } from './model';

export const ACTIVITY_SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';
export const HEART_SCOPE = 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly';
export const HEALTH_SCOPES = [ACTIVITY_SCOPE, HEART_SCOPE] as const;
export const HEALTH_CALLBACK = '/api/health/callback';
export const HealthStatusSchema = z.object({
  configured: z.boolean(), connected: z.boolean(), scopes: z.array(z.string()),
  redirectUri: z.string().url(), missingConfiguration: z.array(z.string()),
});
export const HealthWorkoutSchema = z.object({
  id: z.string().min(1).max(300), name: z.string().max(200), type: z.string().max(100),
  startTime: z.string().datetime({ offset: true }), endTime: z.string().datetime({ offset: true }),
  activeSeconds: z.number().finite().nonnegative().optional(), device: z.string().max(200).optional(),
});
export const HealthWorkoutsSchema = z.object({
  workouts: z.array(HealthWorkoutSchema), truncated: z.boolean(),
});
export const HealthDaySchema = z.object({
  steps: z.number().finite().int().nonnegative().optional(),
  averageHeartRate: z.number().finite().positive().optional(),
  maxHeartRate: z.number().finite().positive().optional(),
  warnings: z.array(z.string()),
});
export const HealthOverviewSchema = HealthWorkoutsSchema.extend({ summary: HealthDaySchema });
export const HealthWorkoutMetricsSchema = z.object({
  workout: HealthWorkoutSchema, metrics: MetricsSchema, warnings: z.array(z.string()),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthWorkout = z.infer<typeof HealthWorkoutSchema>;
export type HealthDay = z.infer<typeof HealthDaySchema>;
export type HealthOverview = z.infer<typeof HealthOverviewSchema>;
export type HealthWorkoutMetrics = z.infer<typeof HealthWorkoutMetricsSchema>;
