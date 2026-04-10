// app/lib/learn/topics.ts
// Central Learn-more topic library (Land Wx + Space Wx)
//
// Notes:
// - IDs are stable deep-link keys (via learnTopicId from NerdyExplainModal).
// - Keep aliases when renaming IDs so older links don’t break.

export type LearnReference = {
  label: string;
  value: string;
};

export type LearnTopic = {
  id: string;
  title: string;
  summary?: string;
  references?: LearnReference[];
  bullets?: string[];
  body?: string;
  formula?: string;
  formulaNotes?: string[];
  insight?: string;
};

export const LEARN_TOPICS: LearnTopic[] = [
  // =========================
  // Land Wx
  // =========================

  {
    id: 'dewpoint',
    title: 'Dew Point (and why it matters more than humidity)',
    summary:
      'Dew point is one of the best measures of how much moisture is actually in the air. It usually tells you more about stickiness and muggy feel than relative humidity does.',
    references: [
      { label: 'Dry feel', value: '< 50°F' },
      { label: 'Comfortable', value: '50–59°F' },
      { label: 'Sticky', value: '60–69°F' },
      { label: 'Tropical feel', value: '70°F+' },
    ],
    bullets: [
      'Higher dew point usually feels stickier and heavier.',
      'Dew point is more stable and useful than RH for judging actual moisture.',
      'When temperature gets close to dew point, fog, dew, or low clouds become more likely.',
    ],
    body:
      'Dew point is the temperature the air would need to cool to in order to become saturated. That makes it one of the most practical “what does the air really feel like?” weather fields.',
      formula:
    'Td ≈ T - ((100 - RH) / 5)',

    formulaNotes: [
    'Approximation only',
    'Td = dew point',
],

  insight:
    'Dew point is the closest thing to a “true moisture” variable in everyday weather.',
  },

  {
    id: 'humidity',
    title: 'Relative Humidity (RH)',
    summary:
      'Relative humidity tells you how close the air is to saturation at the current temperature. It does not tell you the total amount of moisture in the air by itself.',
    references: [
      { label: 'Very dry', value: '< 25%' },
      { label: 'Comfortable', value: '30–50%' },
      { label: 'Humid feel', value: '60%+' },
      { label: 'Near saturation', value: '90%+' },
    ],
    bullets: [
      'RH depends heavily on temperature.',
      'RH often rises at night as air cools, even if moisture does not change much.',
      'Dew point is usually the better metric for actual moisture content.',
    ],
    body:
      'Relative humidity is a “how full is the bucket right now?” number. Warm air can hold more water vapor than cool air, so RH can change a lot through the day even when the moisture in the air has barely changed.',
  },

    {
    id: 'spread_temp_dew',
    title: 'Spread (Temperature − Dew Point)',
    summary:
      'The spread between temperature and dew point shows how close the air is to saturation near the ground. A smaller spread usually means the air is getting closer to fog, dew, frost, or low cloud formation.',
    references: [
      { label: '0–3°F spread', value: 'Air is very close to saturation' },
      { label: '4–10°F spread', value: 'Some moisture-related effects are possible' },
      { label: '10°F+ spread', value: 'Air is usually dry enough to limit immediate fog risk' },
    ],
    bullets: [
      'Small spread means temperature and dew point are close together.',
      'A shrinking spread often signals increasing fog or dew potential overnight.',
      'A larger spread usually means drier air near the surface.',
    ],
    body:
      'Temperature tells you how warm the air is, while dew point tells you how much moisture it contains. The difference between them is the amount of cooling still needed before condensation begins.',
    formula: 'Spread = Temperature − Dew Point',

    insight:
    'This is one of the best quick signals for fog risk and near-surface moisture behavior. Small spread = things are about to happen.',
  },

  {
  id: 'heat-index',
  title: 'Heat Index (Why humidity makes heat feel worse)',
  summary:
    'Heat Index estimates how hot it feels when humidity slows down sweat evaporation — your body’s main cooling system.',

  references: [
    { label: 'Caution', value: '80–90°F' },
    { label: 'Extreme caution', value: '90–103°F' },
    { label: 'Danger', value: '103–124°F' },
    { label: 'Extreme danger', value: '125°F+' },
  ],

  bullets: [
    'Your body cools by evaporating sweat — humidity slows that process.',
    'Higher dew point = less efficient cooling = higher heat stress.',
    'Most meaningful in hot + humid conditions.',
  ],

  body:
    'Heat Index reflects how heat and moisture interact with the human body. When the air is humid, sweat cannot evaporate efficiently, so your body struggles to cool itself — making it feel hotter than the actual temperature.',

  formula:
    'HI ≈ -42.379 + 2.049T + 10.143RH - 0.224TRH - 0.00684T² - 0.0548RH² + 0.00123T²RH + 0.000852TRH² - 0.000002T²RH²',

  formulaNotes: [
    'T = temperature (°F)',
    'RH = relative humidity (%)',
    'NOAA/NWS regression formula',
  ],

  insight:
    'Two days with the same temperature can feel completely different depending on humidity — that’s why Phoenix heat and Miami heat feel so different.',
  },

  {
    id: 'wind-chill',
    title: 'Wind Chill',
    summary:
      'Wind Chill estimates how cold exposed skin feels when moving air increases heat loss. It explains why a windy cold day can feel much harsher than the same temperature in calm conditions.',
    references: [
      { label: 'Mild impact', value: 'Below freezing + breeze' },
      { label: 'Bitter cold feel', value: 'Teens / single digits' },
      { label: 'Dangerous exposure', value: 'Below 0°F' },
    ],
    bullets: [
      'Most meaningful when the air is cold and wind is noticeable.',
      'The stronger the wind, the faster exposed skin loses heat.',
      'Calm cold and windy cold can feel very different.',
    ],
    body:
      'Wind chill is about exposed skin and body heat loss. It does not mean objects become colder than the air just because wind is blowing.',
    formula:
    'WC = 35.74 + 0.6215T - 35.75V^{0.16} + 0.4275T·V^{0.16}',

    formulaNotes: [
      'T = temperature (°F)',
      'V = wind speed (mph)',
    ],

    insight:
      'Wind doesn’t lower the air temperature — it increases heat loss from your skin.',
  },

  {
    id: 'apparent-temp',
    title: 'Feels Like (Apparent Temperature)',
    summary:
      'Apparent temperature is the general-purpose “outside experience” number. It tries to answer how conditions may feel to a person, not just what the thermometer reads.',
    bullets: [
      'Often blends wind, humidity, and sometimes sun effects.',
      'Different providers may calculate it a little differently.',
      'It is useful for comfort, but less specific than Heat Index or Wind Chill.',
    ],
    body:
      'This is the quick convenience metric for “what will it probably feel like outside?” For deeper understanding, it helps to also check whether humidity or wind is causing the difference from air temperature.',
  },

  {
    id: 'wind',
    title: 'Wind (speed, gusts, direction)',
    summary:
      'Wind is not just one number. Sustained wind shows the background flow, gusts show the strongest bursts, and direction helps explain where the air is coming from and what the atmosphere is doing.',
    references: [
      { label: 'Light breeze', value: '6–15 mph' },
      { label: 'Breezy', value: '16–25 mph' },
      { label: 'Windy', value: '26–39 mph' },
      { label: 'Very windy', value: '40–57 mph' },
      { label: 'Hurricane force', value: '74+ mph' },
    ],
    bullets: [
      'Sustained wind is the background flow of air.',
      'Gusts are short bursts that often create the biggest real-world impacts.',
      'Direction shifts can hint at fronts, outflows, storms, or terrain-driven changes.',
    ],
    body:
      'Wind affects comfort, travel, boating, smoke movement, and how stable or chaotic the lower atmosphere feels. A moderate wind with strong gusts can feel much rougher than the main wind number suggests.',
  },

  {
    id: 'gusts',
    title: 'Gusts (the bursts you actually feel)',
    summary:
      'Gusts are short bursts of stronger wind above the sustained speed, and they are often what make a day feel rough, jumpy, or unexpectedly disruptive.',
    references: [
      { label: 'Noticeable bursts', value: '20–30 mph' },
      { label: 'Annoying / disruptive', value: '30–40 mph' },
      { label: 'Travel impacts', value: '40–50+ mph' },
      { label: 'Dangerous wind', value: '58+ mph' },
    ],
    bullets: [
      'Gusts are not the same as sustained wind.',
      'They often matter more for driving, loose objects, and rough outdoor conditions.',
      'They can spike with mixing, showers, terrain, or passing fronts.',
    ],
    body:
      'If sustained wind is the background flow, gusts are the sharper bursts on top of it. They are often the part people notice first.',
  },

  {
    id: 'wind-reference',
    title: 'Wind Speed Reference Guide',
    summary:
      'Wind numbers are easier to understand when translated into what people actually experience outside.',
    references: [
      { label: 'Calm', value: '0–5 mph' },
      { label: 'Light breeze', value: '6–15 mph' },
      { label: 'Breezy', value: '16–25 mph' },
      { label: 'Windy', value: '26–39 mph' },
      { label: 'Very windy', value: '40–57 mph' },
      { label: 'Hurricane force', value: '74+ mph' },
    ],
    bullets: [
      '20 mph: you notice it.',
      '30 mph: umbrellas start losing.',
      '40 mph: crosswinds matter.',
      '50+ mph: loose objects and branches become a real issue.',
    ],
    body:
      'A reference guide helps turn raw wind numbers into something a user can immediately picture and apply.',
  },

  {
    id: 'wind-direction',
    title: 'Wind Direction (where the air is coming from)',
    summary:
      'Wind direction tells you where the air is coming from, and those shifts can reveal major changes in the atmosphere.',
    bullets: [
      'A north wind means air is coming from the north, not blowing toward it.',
      'Direction shifts can signal fronts, outflows, terrain flow, or sea-breeze changes.',
      'Direction helps explain why temperature and moisture change.',
    ],
    body:
      'A change in wind direction can tell a better weather story than a change in speed alone because it gives clues about changing air masses and pattern transitions.',
  },

   {
    id: 'gust_factor',
    title: 'Gust Factor (Gust ÷ Wind)',
    summary:
      'Gust factor compares the strongest bursts of wind to the background sustained wind. It helps show whether the wind is arriving smoothly or in sharp, jumpy surges.',
    references: [
      { label: 'Near 1.0', value: 'Wind is relatively steady' },
      { label: 'Around 1.3–1.6', value: 'Conditions feel noticeably gusty' },
      { label: 'Much higher', value: 'Wind is bursty, erratic, or turbulent' },
    ],
    bullets: [
      'Higher gust factor means wind is arriving in stronger bursts.',
      'It often affects comfort and handling more than average wind alone.',
      'Near-calm sustained wind can make the ratio noisy.',
    ],
    body:
      'This alias matches the newer hourly deep-link key. It describes the texture of the wind, not just its average speed.',
    formula: 'Gust Factor = Gust Speed ÷ Sustained Wind',

    insight:
      'Two days with the same wind speed can feel completely different depending on gust factor. High gust factor = chaotic, jumpy wind.',
  },

  {
    id: 'pop',
    title: 'POP (Probability of Precipitation)',
    summary:
      'POP is the chance of measurable precipitation at your location during a forecast period. It is a probability, not a measure of intensity, duration, or coverage by itself.',
    references: [
      { label: 'Low chance', value: '20% or less' },
      { label: 'Moderate chance', value: '30–50%' },
      { label: 'Good chance', value: '60–80%' },
      { label: 'Very likely', value: '90%+' },
    ],
    bullets: [
      'POP does not say how hard it will rain.',
      'POP does not mean it rains for that percent of the day.',
      'It is about the chance that measurable precipitation happens at your point.',
    ],
    body:
      'A 40% POP means there is a 40% chance of measurable precipitation at your location during the forecast period. It does not mean rain covers 40% of the map or lasts 40% of the time.',
  },

  {
    id: 'clouds',
    title: 'Cloud Cover',
    summary:
      'Cloud cover changes much more than sky appearance. It strongly affects daytime heating, nighttime cooling, light levels, and how the whole day feels.',
    references: [
      { label: 'Mostly clear', value: 'Low cloud cover' },
      { label: 'Partly cloudy', value: 'Mixed sky' },
      { label: 'Mostly cloudy', value: 'Limited sun' },
      { label: 'Overcast', value: 'Near full cover' },
    ],
    bullets: [
      'Clouds reduce incoming sunlight by day.',
      'Clouds can slow heat loss at night.',
      'Low thick clouds often matter more than thin high clouds.',
    ],
    body:
      'Clouds can act like a sunshade by day and a blanket by night. That makes cloud cover one of the most important “feel and forecast evolution” fields.',
    insight:
  'Clouds are one of the strongest controls on temperature swings — they regulate both heating (day) and cooling (night).',
  },

  {
    id: 'shortwave-radiation',
    title: 'Shortwave Radiation (sunlight reaching the surface)',
    summary:
      'Shortwave radiation is incoming solar energy reaching the ground, and it is a major driver of daytime heating and atmospheric mixing.',
    references: [
      { label: 'High shortwave', value: 'More heating' },
      { label: 'Reduced shortwave', value: 'Cloud-muted day' },
    ],
    bullets: [
      'More shortwave usually means stronger surface heating.',
      'Clouds are one of the biggest controls on shortwave reaching the surface.',
      'Strong shortwave often helps deepen daytime mixing.',
    ],
    body:
      'This is one of the hidden reasons sunny afternoons often become warmer, drier, and gustier.',
  },

   {
    id: 'radiation-regime',
    title: 'Radiation Regime (net surface heating vs cooling)',
    summary:
      'Radiation regime describes whether the surface is gaining energy overall or losing it. That helps explain why some periods favor warming and mixing while others favor cooling, fog, or frost.',
    references: [
      { label: 'Net warming', value: 'Supports heating and mixing' },
      { label: 'Net cooling', value: 'Supports stability, fog, dew, or frost' },
    ],
    bullets: [
      'Sunlight adds energy during the day.',
      'Infrared heat loss removes energy, especially at night.',
      'Clouds can reduce daytime heating but also reduce nighttime cooling.',
    ],
    body:
      'This is a more diagnostic concept than a simple weather number, but it helps explain why the atmosphere behaves differently between day and night or between clear and cloudy setups.',
    formula:
    'Net Radiation = Incoming Solar − Outgoing Infrared',

    insight:
    'Radiational regimes explain WHY conditions feel stable vs active — not just what is happening.',
  },

  {
    id: 'uv',
    title: 'UV Index',
    summary:
      'UV Index is a quick exposure-risk scale for ultraviolet radiation from the Sun. It is about skin and eye exposure risk, not about how hot the air feels.',
    references: [
      { label: 'Low', value: '0–2' },
      { label: 'Moderate', value: '3–5' },
      { label: 'High', value: '6–7' },
      { label: 'Very high', value: '8–10' },
      { label: 'Extreme', value: '11+' },
    ],
    bullets: [
      'UV usually peaks near midday.',
      'Elevation, snow, and water can increase exposure.',
      'Clouds can reduce UV, but often less than people assume.',
    ],
    body:
      'You can have high UV on a cool day, which is why people sometimes underestimate exposure risk when the air temperature feels pleasant.',
  },

  {
    id: 'visibility',
    title: 'Visibility',
    summary:
      'Visibility is how far you can clearly see near the surface, and it is one of the most practical impact fields in weather.',
    references: [
      { label: 'Good visibility', value: 'Several miles+' },
      { label: 'Reduced', value: 'A few miles' },
      { label: 'Poor', value: '< 1 mile' },
      { label: 'Dense fog scale', value: 'Very low visibility' },
    ],
    bullets: [
      'Fog, smoke, dust, haze, and heavy precip can all reduce visibility.',
      'Visibility matters for driving, aviation, marine travel, and outdoor safety.',
      'Big changes are often more important than the exact number.',
    ],
    body:
      'A rapid drop in visibility often matters more to daily life than a technical weather label because it changes travel and safety conditions immediately.',
    insight:
    'Visibility drops when particles (water droplets, smoke, dust) scatter light — not just when “weather is bad.”',
  },

  {
    id: 'pressure',
    title: 'Pressure (Sea-Level Pressure)',
    summary:
      'Pressure is one of the main big-picture weather setup fields. It helps show whether the atmosphere is sitting in a broader, more stable high-pressure pattern or a more active low-pressure environment. The raw number matters less than the pattern, the trend, and the surrounding pressure differences.',
    references: [
      { label: 'Higher pressure', value: 'Often tied to more stable background conditions' },
      { label: 'Lower pressure', value: 'Often tied to a more unsettled pattern' },
      { label: 'Fast pressure change', value: 'Usually more meaningful than the number alone' },
    ],
    bullets: [
      'Pressure helps explain the larger weather pattern.',
      'Pressure trend often matters more than one isolated reading.',
      'Pressure differences across distance help drive wind.',
    ],
    body:
      'Sea-level pressure is one of the atmosphere’s organizing fields. It helps explain highs, lows, fronts, and changing wind patterns. Instead of focusing on one number by itself, it is usually more useful to watch whether pressure is rising or falling and how it compares with the surrounding region.',
  },

  {
    id: 'pressure-tendency',
    title: 'Pressure Tendency',
    summary:
      'Pressure tendency focuses on how pressure is changing over time, which often says more about evolving weather than the raw number itself.',
    references: [
      { label: 'Falling', value: 'Often signals an approaching disturbance or increasing change' },
      { label: 'Rising', value: 'Often signals stabilizing or post-frontal conditions' },
      { label: 'Rapid change', value: 'Usually a more meaningful signal' },
    ],
    bullets: [
      'Falling pressure often suggests an approaching low or front.',
      'Rising pressure often follows clearing or stabilization.',
      'The rate of change is often more informative than the absolute value.',
    ],
    body:
      'Pressure tendency is one of the best “what is changing?” weather signals, especially when paired with wind shifts and cloud trends.',
  },

  {
    id: 'nws-alerts',
    title: 'NWS Alerts (what they mean)',
    summary:
      'NWS alerts are official hazard messages designed to communicate risk, timing, location, and action. The short headline is helpful, but the full text is where the important details usually live.',
    bullets: [
      'Alerts are tied to areas and timing windows.',
      'They can be updated, expanded, replaced, or canceled as conditions evolve.',
      'Official protective action guidance always takes priority.',
    ],
    body:
      'Alerts are not just labels. They are operational safety messages that explain what the hazard is, when it matters, where it matters, and what actions are recommended.',
  },

  {
    id: 'data-availability',
    title: 'Why Some Fields Are Blank',
    summary:
      'Blank fields usually mean the upstream data source did not provide that value for that place or time. We prefer missing to misleading when the data is not actually available.',
    bullets: [
      'Not every source includes every variable everywhere.',
      'We do not invent values when the source is missing.',
      'Coverage can improve later by adding fallback providers.',
    ],
    body:
      'A blank field is often a trust decision, not an error. A made-up filled value can look polished but be more misleading than showing that the data is unavailable.',
  },

  {
    id: 'fog',
    title: 'Fog',
    summary:
      'Fog is essentially a cloud that forms at the surface when air cools enough to reach saturation. It is often less about dramatic weather and more about quiet setup: cooling, moisture, and light wind.',
    references: [
      { label: 'Higher risk clue', value: 'Tiny temperature-dew point spread' },
      { label: 'Classic setup', value: 'Night + light wind' },
    ],
    bullets: [
      'Fog becomes more likely when temperature gets very close to dew point.',
      'Light wind often helps fog form by allowing shallow cooling near the ground.',
      'Clear nights often support stronger cooling, though cloud effects can complicate the setup.',
    ],
    body:
      'Fog is a boundary-layer story. The near-surface air cools, saturates, and condenses into tiny droplets suspended near the ground.',
  },

  {
    id: 'fog_risk',
    title: 'Fog Risk',
    summary:
      'Fog risk estimates how favorable the near-surface setup is for fog formation. It usually rises when temperature gets close to dew point, winds stay light, and moisture is able to collect near the ground.',
    references: [
      { label: 'Higher risk setup', value: 'Small spread and light wind' },
      { label: 'Most common timing', value: 'Late night through early morning' },
      { label: 'Main impact', value: 'Visibility can drop quickly' },
    ],
    bullets: [
      'Fog usually forms in quiet, moisture-rich setups rather than dramatic weather.',
      'Light wind often helps moisture pool near the surface.',
      'A high fog-risk score means conditions are favorable, not guaranteed.',
    ],
    body:
      'Fog is essentially cloud at ground level. A fog-risk metric blends the ingredients that make that more likely, especially overnight when cooling brings air temperature closer to dew point.',
  },

  {
    id: 'frost',
    title: 'Frost',
    summary:
      'Frost forms when surfaces cool enough for water vapor to deposit as ice, often under calm, clear, efficient-cooling conditions.',
    bullets: [
      'Clear skies often help surfaces lose heat efficiently overnight.',
      'Light wind usually favors frost more than strong wind.',
      'Surfaces can cool faster than the air a few feet above them.',
    ],
    body:
      'Frost is a surface process, not just an air-temperature number. Ground, rooftops, and exposed objects can cool below the surrounding air temperature under the right setup.',
  },

  {
    id: 'air-pressure-gradient',
    title: 'Pressure Gradient (why wind starts moving)',
    summary:
      'Pressure gradient is the change in pressure across distance, and it is one of the main reasons air starts moving from place to place. Wind is not just about pressure. It is about pressure differences.',
    bullets: [
      'A tighter pressure gradient usually supports stronger wind.',
      'A weaker gradient usually supports lighter wind.',
      'This is one reason nearby highs and lows can change wind dramatically.',
    ],
    body:
      'Pressure gradient is the push behind the wind. When pressure changes a lot over a short distance, the atmosphere has a stronger reason to move air.',
  },

  // =========================
  // Space Wx (Solar tab)
  // =========================

  {
    id: 'noaa-scales',
    title: 'NOAA Space Weather Scales (G / R / S)',
    summary:
      'NOAA’s G, R, and S scales summarize the practical impacts of space weather instead of just raw measurements.',
    references: [
      { label: 'G', value: 'Geomagnetic' },
      { label: 'R', value: 'Radio blackout' },
      { label: 'S', value: 'Solar radiation' },
    ],
    bullets: [
      'G covers geomagnetic storm impacts and aurora relevance.',
      'R covers radio blackout impacts from flare-driven X-rays.',
      'S covers radiation impacts from energetic particles.',
    ],
    body:
      'These scales translate complicated space physics into operational “what it does” language rather than just sensor values.',
  },

  {
    id: 'solar-wind',
    title: 'Solar Wind at L1 (speed, density, temperature)',
    summary:
      'L1 solar wind data is an upstream look at plasma conditions before they fully reach Earth.',
    references: [
      { label: 'Speed', value: 'How fast it is arriving' },
      { label: 'Density', value: 'How packed it is' },
      { label: 'Temperature', value: 'Plasma character' },
    ],
    bullets: [
      'Speed influences how much energy may be available.',
      'Density affects dynamic pressure and magnetosphere compression.',
      'Bz often helps determine how efficiently that energy couples.',
    ],
    body:
      'Think of L1 as a short-range checkpoint between the Sun and Earth. It gives a heads-up before those conditions fully interact with Earth’s magnetic environment.',
  },

  {
    id: 'imf-bz',
    title: 'IMF Bz (southward turning = better aurora coupling)',
    summary:
      'Bz is the north-south component of the interplanetary magnetic field, and it is one of the biggest short-term aurora switches.',
    references: [
      { label: 'Northward Bz', value: 'Weaker coupling' },
      { label: 'Southward Bz', value: 'Stronger coupling' },
    ],
    bullets: [
      'Southward or negative Bz usually improves coupling with Earth’s magnetic field.',
      'That coupling can increase geomagnetic activity and aurora potential.',
      'Bz is one of the most watched short-term space-weather fields.',
    ],
    body:
      'Fast solar wind helps, but negative Bz often determines whether the magnetosphere really lights up.',
  },

  {
    id: 'kp',
    title: 'Kp Index (global geomagnetic activity)',
    summary:
      'Kp is a 0–9 global index describing how disturbed Earth’s magnetic field is over time.',
    references: [
      { label: 'Quiet', value: 'Kp 0–2' },
      { label: 'Active', value: 'Kp 3–4' },
      { label: 'Minor storm', value: 'Kp 5' },
      { label: 'Moderate+', value: 'Kp 6+' },
    ],
    bullets: [
      'Higher Kp generally increases aurora odds at lower latitudes.',
      'Kp is derived from multiple stations, not one sensor.',
      'Cloud cover, darkness, and latitude still matter a lot.',
    ],
    body:
      'Kp is useful because it compresses a complicated global magnetic response into a simple number, but it is not the whole aurora story.',
  },

  {
    id: 'xray-flux',
    title: 'GOES X-ray Flux and Flare Class',
    summary:
      'GOES X-ray flux shows how bright the Sun is in X-rays, and sudden spikes usually mark solar flares.',
    references: [
      { label: 'Small', value: 'A/B/C class' },
      { label: 'Strong', value: 'M class' },
      { label: 'Extreme', value: 'X class' },
    ],
    bullets: [
      'Flare classes are logarithmic, not linear.',
      'A sharp rise in X-ray flux means the Sun is suddenly more active.',
      'Not every flare launches an Earth-directed CME.',
    ],
    body:
      'This is one of the clearest real-time views into sudden solar activity and radio-blackout relevance.',
  },

  {
    id: 'proton-flux',
    title: 'Proton Flux (radiation / S-scale)',
    summary:
      'Proton flux tracks energetic particles near Earth and helps identify solar radiation storm conditions.',
    references: [
      { label: 'Normal', value: 'Background levels' },
      { label: 'Elevated', value: 'Particle event building' },
      { label: 'Storm-level', value: 'S-scale relevance' },
    ],
    bullets: [
      'Elevated protons can raise radiation concerns for polar routes and high altitudes.',
      'These events can affect satellite operations.',
      'NOAA S-scale summarizes the practical impact.',
    ],
    body:
      'This matters much more to aviation, satellites, and astronauts than to most people on the ground, but it is a major part of the broader space-weather risk environment.',
  },

  {
    id: 'donki-events',
    title: 'NASA DONKI Events (flares, CMEs, particle storms)',
    summary:
      'DONKI is NASA’s event catalog for notable space-weather activity and gives narrative context beyond raw charts.',
    bullets: [
      'DONKI catalogs notable flares, CMEs, shocks, and particle events.',
      'It helps connect measurements to actual space-weather events.',
      'CMEs often matter most for delayed geomagnetic storm risk.',
    ],
    body:
      'This helps answer “what happened?” rather than just “what is the sensor doing?” It is especially useful when you want the event context behind the numbers.',
  },
];