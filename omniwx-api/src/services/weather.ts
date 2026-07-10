export type WeatherServiceHealth = {
  ok: true;
  publicRoutesPreserved: true;
};

export function weatherServiceHealth(): WeatherServiceHealth {
  return { ok: true, publicRoutesPreserved: true };
}

