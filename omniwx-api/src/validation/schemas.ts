import { z } from "zod";

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);
export const unitsSchema = z.enum(["imperial", "metric"]).default("imperial");

export const locationQuerySchema = z.object({
  lat: latitudeSchema,
  lon: longitudeSchema,
  units: unitsSchema.optional(),
});

export const bboxQuerySchema = z.object({
  west: longitudeSchema,
  south: z.coerce.number().min(-90).max(90),
  east: longitudeSchema,
  north: z.coerce.number().min(-90).max(90),
  zoom: z.coerce.number().min(0).max(22).optional(),
});

export const locationNameSchema = z.string().trim().min(1).max(120);

export function queryObject(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

