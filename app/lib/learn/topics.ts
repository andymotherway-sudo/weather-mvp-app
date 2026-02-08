// app/lib/learn/topics.ts
// Central Learn-more topic library (Land Wx + Space Wx)
//
// Notes:
// - IDs are stable deep-link keys (via learnTopicId from NerdyExplainModal).
// - Keep aliases when renaming IDs so older links don’t break.

export type LearnTopic = {
  id: string;
  title: string;
  bullets: string[];
  body: string;
};

export const LEARN_TOPICS: LearnTopic[] = [
  // =========================
  // Land Wx
  // =========================

  {
    id: 'dewpoint',
    title: 'Dew Point (and why it’s different than humidity)',
    bullets: [
      'Dew point is a direct measure of moisture in the air.',
      'Higher dew point feels “stickier,” even if temperatures are moderate.',
      'When temperature gets close to dew point, fog or dew becomes more likely.',
    ],
    body:
      'Relative humidity depends on temperature. Dew point does not.\n\n' +
      'Dew point is the temperature the air must cool to in order to become saturated. When the spread between temperature and dew point shrinks (often < 3°F), the air is close to saturation and fog/dew becomes more likely—especially overnight with light wind.',
  },

  {
    id: 'humidity',
    title: 'Relative Humidity (RH)',
    bullets: [
      'RH is “how close to saturated” the air is at the current temperature.',
      'RH can rise at night even if moisture stays the same (because temperature falls).',
      'Use dew point for a more stable moisture signal.',
    ],
    body:
      'Relative humidity is relative to temperature. Two air masses with the same dew point can have very different RH if temperatures differ.\n\n' +
      'RH is still useful for comfort and drying potential, but dew point is the better “absolute moisture” metric.',
  },

  // Keep BOTH IDs as aliases, since some codebases used thermal_spread and others used spread.
  {
    id: 'spread',
    title: 'Thermal spread (Temp − Dew Point)',
    bullets: [
      'A quick “saturation check.”',
      'Small spread = fog/dew/frost risk increases.',
      'Large spread = drier air, bigger day/night swings.',
    ],
    body:
      'Thermal spread is simply temperature minus dew point. A tiny spread means air is close to saturated; any cooling can condense moisture into fog or dew.\n\n' +
      'A large spread usually means the air is dry, which can allow rapid cooling at night and faster warming during the day.',
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
      'Thermal spread is simply temperature minus dew point. A tiny spread means air is close to saturated; any cooling can condense moisture into fog or dew.\n\n' +
      'A large spread usually means the air is dry, which can allow rapid cooling at night and faster warming during the day.',
  },

  {
    id: 'heat-index',
    title: 'Heat Index',
    bullets: [
      'Estimates how hot it feels when humidity is high.',
      'Most meaningful in warm/humid air.',
      'Not very meaningful in cool/dry conditions.',
    ],
    body:
      'Heat Index combines temperature and humidity to estimate perceived heat when evaporation (sweat) is less effective.\n\n' +
      'We surface Heat Index when it’s the most relevant “feels” driver.',
  },

  {
    id: 'wind-chill',
    title: 'Wind Chill',
    bullets: [
      'Estimates how cold it feels when wind increases heat loss.',
      'Most meaningful in cold air with wind.',
      'Not used when temperatures are warm.',
    ],
    body:
      'Wind Chill is a “feels like” estimate for cold conditions. Stronger winds remove heat from skin faster.\n\n' +
      'We surface Wind Chill when it’s the most relevant “feels” driver.',
  },

  {
    id: 'apparent-temp',
    title: 'Feels Like (Apparent Temperature)',
    bullets: [
      'A provider’s “overall feels like” estimate.',
      'Often blends wind + humidity + radiation effects.',
      'Can differ from Heat Index / Wind Chill formulas.',
    ],
    body:
      '“Feels like” is a convenience metric that can combine multiple effects. In OMNI wx, we may show Heat Index or Wind Chill explicitly when conditions warrant; otherwise we show the provider’s apparent temperature.\n\n' +
      'This can differ slightly between providers due to different assumptions.',
  },

  {
    id: 'wind',
    title: 'Wind (speed, gusts, direction)',
    bullets: [
      'Sustained wind is the “background” flow.',
      'Gusts are short bursts; they drive many real-world impacts.',
      'Direction shifts can hint at fronts, terrain flows, or outflows.',
    ],
    body:
      'Wind affects comfort (evaporation), wildfire behavior, aviation, and surface turbulence.\n\n' +
      'Gustiness often increases with daytime mixing, showers, or frontal passages. Direction changes can be more meaningful than speed changes in diagnosing transitions.',
  },

  {
    id: 'gust-factor',
    title: 'Gust factor (Gust ÷ Wind)',
    bullets: [
      'Higher gust factor usually feels more turbulent.',
      'Can spike with mixing, showers, or frontal passages.',
      'Be cautious when sustained wind is very light.',
    ],
    body:
      'Gust factor is gust speed divided by sustained wind speed. Large values can indicate gustiness beyond typical steady flow.\n\n' +
      'If sustained wind is near calm, the ratio can be noisy—so interpret with context.',
  },

  {
    id: 'pop',
    title: 'POP (Probability of Precip)',
    bullets: [
      'Chance of measurable precipitation at a point.',
      'Not the same as intensity or duration.',
      'Different providers may use slightly different thresholds.',
    ],
    body:
      'POP is a probability. A 40% POP does not mean it will rain 40% of the time; it means there’s a 40% chance of measurable precip at your point during the period.\n\n' +
      'POP doesn’t tell you how hard it rains—only the chance it occurs.',
  },

  {
    id: 'clouds',
    title: 'Cloud cover',
    bullets: [
      'Approximate percent of sky covered by clouds.',
      'Clouds strongly modulate daytime heating and nighttime cooling.',
      'Low clouds block sunlight more effectively than thin high clouds.',
    ],
    body:
      'Cloud cover impacts temperature swings, solar heating, and nighttime cooling (“blanket effect”).\n\n' +
      'Low, thick clouds generally reduce daytime heating more than thin high clouds.',
  },

  // Keep BOTH IDs as aliases, since some codebases used radiation and others used shortwave-radiation.
  {
    id: 'shortwave-radiation',
    title: 'Shortwave radiation (why clouds matter more than you think)',
    bullets: [
      'Shortwave ≈ sunlight reaching the surface.',
      'Clouds reduce shortwave → weaker daytime heating.',
      'Clear nights cool faster (bigger cold dips).',
    ],
    body:
      'Shortwave radiation is incoming solar energy. High shortwave with dry air often boosts mixing, which can lower humidity and increase wind gusts during the afternoon.\n\n' +
      'Conversely, cloud cover reduces shortwave and slows warming. At night, clouds can reduce heat loss.',
  },
  {
    id: 'radiation',
    title: 'Shortwave radiation (why clouds matter more than you think)',
    bullets: [
      'Shortwave ≈ sunlight reaching the surface.',
      'Clouds reduce shortwave → weaker daytime heating.',
      'Clear nights cool faster (bigger cold dips).',
    ],
    body:
      'Shortwave radiation is incoming solar energy. High shortwave with dry air often boosts mixing, which can lower humidity and increase wind gusts during the afternoon.\n\n' +
      'Conversely, cloud cover reduces shortwave and slows warming. At night, clouds can reduce heat loss.',
  },
  {
  id: 'radiation-regime',
  title: 'Radiation Regime (net surface heating vs cooling)',
  bullets: [
    'Describes whether the surface is gaining or losing energy overall.',
    'Daytime sun adds energy; nighttime infrared loss removes it.',
    'Clouds strongly influence which side dominates.',
  ],
  body:
    'Radiation regime describes the *net* energy balance at the surface:\n\n' +
    '• Incoming shortwave (sunlight)\n' +
    '• Outgoing longwave (infrared heat loss)\n\n' +
    'If incoming energy exceeds outgoing loss, the surface is in a **net warming regime**. ' +
    'If heat loss exceeds incoming energy, it is in a **net cooling regime**.\n\n' +
    'Why this matters:\n' +
    '• Net cooling favors fog, frost, and stable layers.\n' +
    '• Net warming promotes mixing, gusts, and boundary-layer growth.\n' +
    '• Clouds reduce daytime heating but also reduce nighttime cooling.\n\n' +
    'In OMNI wx, radiation regime is inferred from sun angle, cloud cover, time of day, and temperature trends. ' +
    'It is a *diagnostic signal*, not a direct measurement.',
  },
  {
    id: 'uv',
    title: 'UV Index',
    bullets: [
      'Scale of sunburn risk from UV radiation.',
      'Higher near midday; also higher at elevation and in clear air.',
      'Clouds reduce UV, but not always to zero.',
    ],
    body:
      'UV Index is a convenient exposure-risk number. It generally peaks near midday.\n\n' +
      'Elevation, clear air, and reflective surfaces (snow/water) can increase UV exposure.',
  },

  {
    id: 'visibility',
    title: 'Visibility',
    bullets: [
      'How far you can see near the surface.',
      'Drops in fog, smoke, haze, dust, and heavy precipitation.',
      'Useful for driving/aviation impacts.',
    ],
    body:
      'Visibility is an impact metric. Rapid drops can signal fog formation, smoke intrusions, dust, or heavy precipitation.\n\n' +
      'If you’re seeing big changes, check alerts and local conditions.',
  },

  // Pressure: keep pressure-tendency as “trend” topic, but keep 'pressure' stable for the tile.
  {
    id: 'pressure',
    title: 'Pressure (sea-level pressure)',
    bullets: [
      'Absolute pressure helps identify highs/lows and broad regimes.',
      'Compare to recent trend; trend often matters more than the number.',
      'Local terrain/elevation can affect station pressure readings.',
    ],
    body:
      'Pressure provides context for whether you’re under a ridge (higher pressure) or trough (lower pressure).\n\n' +
      'When we also show pressure tendency, the change over time (3–6 hours) can be even more informative than the raw value.',
  },

  {
    id: 'pressure-tendency',
    title: 'Pressure tendency (the “steering wheel” of weather changes)',
    bullets: [
      'Falling pressure often precedes strengthening systems / approaching fronts.',
      'Rising pressure often follows clearing / stabilizing conditions.',
      'Rate of change matters more than the absolute number.',
    ],
    body:
      'Pressure tendency focuses on how pressure changes over time (often 3–6 hours).\n\n' +
      'Rapid falls can signal an approaching low/front; rises often signal stabilization and clearing. Combine with wind shifts and cloud trends for better timing.',
  },

  {
    id: 'nws-alerts',
    title: 'NWS Alerts (what they mean)',
    bullets: [
      'Issued by the National Weather Service for hazards in your area.',
      'The headline summarizes the main risk and timing.',
      'Always follow official instructions for action/evacuation guidance.',
    ],
    body:
      'Alerts are tied to polygons/areas and can change as conditions evolve.\n\n' +
      'Use alert details for timing, impacted locations, and recommended actions—especially for evacuation or life-safety guidance.',
  },

  {
    id: 'data-availability',
    title: 'Why some fields are blank',
    bullets: [
      'Some sources don’t include every variable for every place/time.',
      'We don’t invent values when the source is missing data.',
      'Later we can add fallback providers for richer coverage.',
    ],
    body:
      'If pressure/UV/visibility are missing, we treat them as unavailable. That avoids misleading “guesses.”\n\n' +
      'If you want richer coverage everywhere, we can add additional providers and choose the best-available value per field.',
  },

  // =========================
  // Space Wx (Solar tab)
  // =========================

  {
    id: 'noaa-scales',
    title: 'NOAA Space Weather Scales (G / R / S)',
    bullets: [
      'G = geomagnetic storm impacts (power, satellites, aurora).',
      'R = radio blackout impacts (HF comms, GNSS/GPS accuracy).',
      'S = solar radiation storm impacts (aviation, astronauts, satellites).',
    ],
    body:
      'NOAA uses three impact-focused scales:\n\n' +
      '• G-scale (Geomagnetic): driven by geomagnetic storms—often tied to CMEs and strong solar wind coupling.\n' +
      '• R-scale (Radio blackout): driven by solar flares (X-ray) that disturb the ionosphere.\n' +
      '• S-scale (Radiation): driven by energetic particle events (mostly protons) that increase radiation exposure.\n\n' +
      'Higher numbers generally mean broader impacts. These are “what it does” summaries, not raw measurements.',
  },

  {
    id: 'solar-wind',
    title: 'Solar Wind at L1 (speed, density, temperature)',
    bullets: [
      'L1 readings are “upstream” conditions before they hit Earth.',
      'Speed + density set the energy available to drive geomagnetic activity.',
      'Bz (IMF) often decides whether that energy couples efficiently.',
    ],
    body:
      'Space weather monitors often use measurements at the L1 point between Earth and the Sun. This is a “heads up” of incoming solar wind.\n\n' +
      '• Speed: faster wind can enhance geomagnetic activity.\n' +
      '• Density: higher density increases dynamic pressure—can compress Earth’s magnetosphere.\n' +
      '• Temperature: helps characterize the plasma; not always directly tied to impacts.\n\n' +
      'Big impacts often happen when strong wind arrives AND the IMF Bz turns southward.',
  },

  {
    id: 'imf-bz',
    title: 'IMF Bz (southward turning = aurora coupling)',
    bullets: [
      'Bz is the north/south component of the interplanetary magnetic field.',
      'Southward (negative) Bz often increases geomagnetic coupling.',
      'Strong negative Bz + fast wind = higher aurora potential.',
    ],
    body:
      'Bz is a component of the interplanetary magnetic field carried by the solar wind. When Bz turns southward (negative), it can connect more efficiently with Earth’s magnetic field, letting energy flow into the magnetosphere.\n\n' +
      'In practice:\n' +
      '• Bz positive (northward): often quieter, weaker coupling.\n' +
      '• Bz negative (southward): stronger coupling, more geomagnetic activity possible.\n\n' +
      'Bz is one of the most important short-term switches for aurora potential.',
  },

  {
    id: 'kp',
    title: 'Kp Index (global geomagnetic activity)',
    bullets: [
      'Kp is a 0–9 index of global geomagnetic disturbance.',
      'Higher Kp usually increases aurora odds (latitude matters).',
      'It’s a summary index, not a single sensor reading.',
    ],
    body:
      'Kp is a standardized index derived from multiple magnetometer stations worldwide. It summarizes how disturbed Earth’s magnetic field is over time.\n\n' +
      'Rules of thumb:\n' +
      '• Kp 0–2: quiet\n' +
      '• Kp 3–4: unsettled/active\n' +
      '• Kp 5: minor storm (G1)\n' +
      '• Kp 6: moderate storm (G2)\n' +
      '• Kp 7+: strong storms (G3+)\n\n' +
      'Aurora visibility still depends on darkness, cloud cover, and where you are.',
  },

  {
    id: 'xray-flux',
    title: 'GOES X-ray Flux and Flare Class',
    bullets: [
      'GOES X-ray flux measures how bright the Sun is in X-rays.',
      'Spikes indicate solar flares.',
      'Flare class (A/B/C/M/X) is a log scale; X is strongest.',
    ],
    body:
      'GOES satellites measure X-ray brightness from the Sun. Solar flares show up as sharp increases.\n\n' +
      'Flare classes:\n' +
      '• A, B: very small\n' +
      '• C: small/moderate (common)\n' +
      '• M: strong\n' +
      '• X: extreme\n\n' +
      'Flares can cause radio blackouts (R-scale) and may be associated with eruptions, but not every flare produces a CME.',
  },

  {
    id: 'proton-flux',
    title: 'Proton Flux (Radiation / S-scale)',
    bullets: [
      'Proton flux tracks high-energy particles near Earth.',
      'Elevated protons can raise radiation exposure at high altitudes/latitudes.',
      'Strong events map to NOAA S-scale levels.',
    ],
    body:
      'Proton flux is a measure of energetic protons detected near Earth (often via GOES). When these particles increase significantly, it can indicate a solar radiation storm.\n\n' +
      'Why it matters:\n' +
      '• Aviation: polar routes and high-altitude flights can see increased exposure.\n' +
      '• Satellites: energetic particles can cause anomalies.\n' +
      '• Humans in space: exposure risk rises.\n\n' +
      'NOAA’s S-scale summarizes the operational significance of these particle levels.',
  },

  {
    id: 'donki-events',
    title: 'NASA DONKI Events (flares, CMEs, particle events)',
    bullets: [
      'DONKI is an event catalog maintained by NASA.',
      'Events provide narrative context beyond raw sensor numbers.',
      'CMEs can drive geomagnetic storms 1–3 days later.',
    ],
    body:
      'NASA DONKI aggregates notable space weather events such as solar flares, coronal mass ejections (CMEs), and particle events. These entries help explain “why” conditions may change.\n\n' +
      'CMEs are especially important because they can produce geomagnetic storms when they arrive at Earth. Arrival time depends on speed and direction, commonly 1–3 days.',
  },
];
