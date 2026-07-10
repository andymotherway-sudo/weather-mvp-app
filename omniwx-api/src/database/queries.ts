export type D1DatabaseLike = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>;
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export function savedLocationsForUser(db: D1DatabaseLike, userId: string) {
  return db
    .prepare(`
      SELECT id, name, latitude, longitude, created_at, updated_at
      FROM saved_locations
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all();
}

export function deleteSavedLocationForUser(db: D1DatabaseLike, userId: string, locationId: string) {
  return db
    .prepare(`
      DELETE FROM saved_locations
      WHERE id = ?
      AND user_id = ?
    `)
    .bind(locationId, userId)
    .run();
}

