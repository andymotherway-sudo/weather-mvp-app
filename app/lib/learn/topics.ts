// app/lib/learn/topics.ts
export type LearnTopic = {
  id: string;
  title: string;
  bullets: string[];
  body: string;
};

export const LEARN_TOPICS: LearnTopic[] = [
  {
    id: 'dewpoint',
    title: 'Dew Point (and why it’s different than humidity)',
    bullets: [
      'Dew point is a direct measure of moisture in the air.',
      'Higher dew point feels “stickier,” even if temps are moderate.',
      'When temp gets close to dew point, fog or dew becomes likely.',
    ],
    body:
      'Relative humidity depends on temperature. Dew point does not. Dew point is the temperature air must cool to in order to become saturated. When the spread between temperature and dew point shrinks (often < 3°F), the air is close to saturation, and fog/dew becomes more likely—especially overnight with light wind.',
  },
  {
    id: 'pressure',
    title: 'Pressure tendency (the “steering wheel” of weather changes)',
    bullets: [
      'Falling pressure often signals approaching lift/fronts.',
      'Rising pressure often signals drying/clearing.',
      'Fast changes matter more than absolute pressure.',
    ],
    body:
      'Surface pressure is a proxy for the mass of air above you. When pressure falls quickly, air is being removed aloft or rising motion is increasing—both can support cloudiness, wind shifts, and precipitation. Rising pressure is often linked to subsidence and stabilization (clearing). The trend (ΔhPa over 3–6 hours) is frequently more informative than the raw number.',
  },
  {
    id: 'thermal_spread',
    title: 'Thermal spread (Temp − Dew Point)',
    bullets: [
      'A quick “saturation check.”',
      'Small spread = fog/dew/frost risk increases.',
      'Large spread = drier air, bigger day/night swings.',
    ],
    body:
      'Thermal spread is simply temperature minus dew point. A tiny spread means air is close to saturated; any cooling can condense moisture into fog or dew. A large spread usually means the air is dry, which can allow rapid cooling at night and faster warming during the day.',
  },
  {
    id: 'radiation',
    title: 'Shortwave radiation (why clouds matter more than you think)',
    bullets: [
      'Shortwave ≈ sunlight reaching the surface.',
      'Clouds reduce shortwave and reduce daytime heating.',
      'Clear nights radiate heat away faster (bigger cold dips).',
    ],
    body:
      'Shortwave radiation is incoming solar energy. High shortwave + low clouds tends to produce strong surface heating and mixing, which can change winds and humidity through the day. Conversely, high cloud cover reduces shortwave and slows warming. At night, cloud cover can act like a “blanket,” reducing heat loss.',
  },
];
