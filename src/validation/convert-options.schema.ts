import { z } from 'zod';

export const convertOptionsSchema = z.object({
  input: z
    .string()
    .min(1, 'Input directory is required')
    .refine((value) => !value.includes('\0'), 'Input path contains invalid characters'),
  output: z
    .string()
    .min(1, 'Output directory is required')
    .refine((value) => !value.includes('\0'), 'Output path contains invalid characters'),
  lut: z
    .string()
    .optional()
    .refine((value) => value === undefined || !value.includes('\0'), 'LUT path contains invalid characters'),
  concurrency: z
    .number()
    .int('Concurrency must be an integer')
    .min(1, 'Concurrency must be at least 1')
    .max(64, 'Concurrency must be at most 64'),
  dryRun: z.boolean(),
  resume: z.boolean(),
  reportPath: z.string().optional(),
});

export type ConvertOptionsInput = z.infer<typeof convertOptionsSchema>;

export const cliConvertOptionsSchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  lut: z.string().optional(),
  concurrency: z.coerce.number().int().min(1).max(64).default(4),
  dryRun: z.boolean().default(false),
  resume: z.boolean().default(false),
  report: z.string().optional(),
});

export type CliConvertOptions = z.infer<typeof cliConvertOptionsSchema>;
