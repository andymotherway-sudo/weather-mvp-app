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
    id: 'air-quality',
    title: 'Air Quality',
    summary:
      'Air quality is a quick read on how clean or dirty the air is near the surface. Haze, smoke, dust, and pollution can all lower air quality and affect both breathing comfort and overall sky clarity.',
    references: [
      { label: 'Cleaner air', value: 'Lower smoke, dust, and particulate load' },
      { label: 'Mixed air', value: 'Some haze or particulate signal' },
      { label: 'Poorer air', value: 'More smoke, dust, or trapped pollution' },
    ],
    bullets: [
      'Poor air quality can make running and hiking feel harder even when temperature looks fine.',
      'Smoke and aerosols can also reduce contrast and scenic visibility.',
      'Air quality is related to sky transparency, but it is not the same thing as cloud cover.',
    ],
    body:
      'This app’s air-quality readout is a practical surface signal based on aerosol loading. Cleaner readings usually mean easier breathing and better distance clarity, while degraded readings suggest more haze, smoke, or dust in the air.',
    insight:
      'A day can be dry and sunny but still feel off outdoors if smoke or haze is suspended in the air.',
  },

  {
    id: 'activity-scores',
    title: 'Activity Scores',
    summary:
      'Activity scores are simple fit ratings for specific plans like running, hiking, camping, boating, flying, fishing, and stargazing. Higher scores mean the weather lines up better for that activity.',
    bullets: [
      'Running and hiking weigh comfort, air quality, UV, wind, and rain.',
      'Camping weighs overnight comfort, wind, rain, fire weather, and nearby restrictions when available.',
      'Fishing and boating lean heavily on wind, gusts, rain, and sky conditions.',
      'Flying emphasizes visibility, wind, gusts, and precipitation risk.',
      'Stargazing uses Sky Score, cloud layers, aerosols, and moonlight.',
    ],
    body:
      'These scores are not safety guarantees or official briefings. They are quick-read planning tools that combine the most important weather signals for each activity into one number so you can compare today with the next several days at a glance.',
    references: [
      { label: '80-100', value: 'Excellent fit' },
      { label: '60-79', value: 'Generally favorable' },
      { label: '40-59', value: 'Mixed or conditional' },
      { label: '0-39', value: 'Poor fit' },
    ],
    insight:
      'The same weather can be good for one activity and poor for another, so each score uses a different recipe on purpose.',
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

  {
    id: 'solar-view-continuum',
    title: 'Solar Continuum View',
    summary:
      'Continuum imagery is a near-visible-light view of the solar surface that makes sunspots easy to identify.',
    bullets: [
      'This is the most natural-looking solar disk view in the app.',
      'Dark sunspot groups often stand out clearly here.',
      'It is useful for seeing where active regions sit on the face of the Sun.',
    ],
    body:
      'Continuum images are good for orienting yourself on the solar disk before switching to more technical magnetic or EUV views. They show broad photospheric structure rather than the hotter upper atmosphere.',
  },

  {
    id: 'solar-view-magnetogram',
    title: 'Solar Magnetogram',
    summary:
      'Magnetograms show the Sun\'s magnetic field polarity across the disk rather than ordinary brightness.',
    bullets: [
      'Active regions usually appear as strong neighboring positive and negative patches.',
      'This view is useful for spotting magnetic complexity.',
      'Complex magnetic regions are often linked with stronger flare potential.',
    ],
    body:
      'A magnetogram is not a photo in the usual sense. It is a magnetic map, and it is one of the quickest ways to see where the Sun is storing the field structure that can later power flares or eruptions.',
  },

  {
    id: 'solar-view-euv171',
    title: 'Solar EUV 171 A',
    summary:
      '171 angstrom imagery emphasizes cooler coronal loops in the Sun\'s upper atmosphere.',
    bullets: [
      'Coronal loops and arcades are often easiest to follow in this channel.',
      'It is useful for the magnetic skeleton of the corona.',
      'Bright loop systems usually outline active regions well.',
    ],
    body:
      'The 171 channel is a classic coronal view. It shows glowing loop structures suspended above the solar surface and helps make the Sun\'s magnetic architecture visually obvious.',
  },

  {
    id: 'solar-view-euv193',
    title: 'Solar EUV 193 A',
    summary:
      '193 angstrom imagery is especially good for coronal holes, hotter corona, and structures tied to high-speed solar wind streams.',
    bullets: [
      'Dark coronal holes often stand out strongly in this wavelength.',
      'Those holes can be the source of faster solar wind reaching Earth later.',
      'It is one of the most useful channels for broad space-weather context.',
    ],
    body:
      'If you want one fast-look solar image for operational context, 193 is one of the best choices. It helps show where the corona is open, where active regions are intense, and where recurring high-speed wind may come from.',
  },

  {
    id: 'solar-view-euv304',
    title: 'Solar EUV 304 A',
    summary:
      '304 angstrom imagery highlights the chromosphere and prominences around the edge of the Sun.',
    bullets: [
      'Prominences and filaments stand out well here.',
      'This view is useful for seeing material suspended above the solar surface.',
      'It often looks more textured and dynamic than the white-light surface views.',
    ],
    body:
      'The 304 channel is useful when you want a better look at prominences, filaments, and lower-atmosphere solar structure. It is one of the most visually distinct live solar views.',
  },

  {
    id: 'solar-view-coronagraph',
    title: 'Solar Coronagraph View',
    summary:
      'A coronagraph blocks the bright solar disk so the much fainter outer corona and outgoing CMEs can be seen.',
    bullets: [
      'This is the view people often watch for big CME signatures.',
      'The black circle is intentional and hides the bright Sun on purpose.',
      'Large eruptions can appear as expanding halos or asymmetric clouds moving outward.',
    ],
    body:
      'Coronagraph imagery is one of the most important views for seeing whether a solar eruption is actually leaving the Sun. It complements flare and X-ray data by showing the outer-coronal response and CME structure.',
  },
  {
    id: 'astro-sunrise-sunset',
    title: 'Sunrise and Sunset',
    summary:
      'Sunrise is when the upper edge of the Sun appears above the horizon. Sunset is when it disappears below the horizon.',
    bullets: [
      'These are geometric horizon events, not the start or end of all useful light.',
      'Useful daylight often begins before sunrise and lingers after sunset because of twilight.',
      'Terrain, buildings, and haze can make real-world light feel earlier or later than the listed clock time.',
    ],
    body:
      'Sunrise and sunset mark the official day-night boundary for the Sun itself. They are important anchor points, but they do not describe the full transition of the sky. Twilight phases before sunrise and after sunset are usually more relevant for observers, photographers, and anyone tracking sky brightness.',
    insight:
      'If you care about sky conditions, sunrise and sunset are the endpoints. Twilight tells the real story in between.',
  },

  {
    id: 'astro-moonrise-moonset',
    title: 'Moonrise and Moonset',
    summary:
      'Moonrise and moonset mark when the Moon crosses the horizon, which strongly affects how bright the night sky feels.',
    bullets: [
      'A bright Moon above the horizon can wash out faint stars and deep-sky objects.',
      'Moonrise and moonset can happen at any time of day or night depending on the phase.',
      'The effect on the sky also depends on moon phase and illumination, not just whether the Moon is up.',
    ],
    body:
      'Moonrise and moonset matter because the Moon is often the biggest natural light source in the night sky. A moonlit night can look dramatically different from a moon-free one even under the same clouds and transparency.',
    insight:
      'For astronomy, the best night is often not just clear. It is clear when the Moon is down.',
  },

  {
    id: 'astro-civil-twilight',
    title: 'Civil Twilight',
    summary:
      'Civil twilight is the period when the Sun is between 0 and 6 degrees below the horizon.',
    references: [
      { label: 'Evening', value: 'Sunset to civil dusk' },
      { label: 'Morning', value: 'Civil dawn to sunrise' },
    ],
    bullets: [
      'There is still plenty of natural light for most outdoor activity.',
      'Bright planets and the first stars may appear, but the sky is still fairly bright.',
      'This is usually too bright for serious deep-sky observing.',
    ],
    body:
      'Civil twilight is the brightest twilight phase. It is the transition where the Sun is below the horizon, but scattered sunlight still strongly illuminates the sky.',
  },

  {
    id: 'astro-nautical-twilight',
    title: 'Nautical Twilight',
    summary:
      'Nautical twilight is the period when the Sun is between 6 and 12 degrees below the horizon.',
    references: [
      { label: 'Evening', value: 'Civil dusk to nautical dusk' },
      { label: 'Morning', value: 'Nautical dawn to civil dawn' },
    ],
    bullets: [
      'The horizon is still faintly visible in good conditions.',
      'More stars become visible than during civil twilight.',
      'The sky is darker, but still not at full astronomical darkness.',
    ],
    body:
      'Nautical twilight is the middle twilight phase. It is much dimmer than civil twilight and often feels meaningfully dark to casual observers, while still holding some scattered sunlight in the sky.',
  },

  {
    id: 'astro-astronomical-twilight',
    title: 'Astronomical Twilight',
    summary:
      'Astronomical twilight is the period when the Sun is between 12 and 18 degrees below the horizon.',
    references: [
      { label: 'Evening', value: 'Nautical dusk to astronomical dusk' },
      { label: 'Morning', value: 'Astronomical dawn to nautical dawn' },
    ],
    bullets: [
      'This is the darkest twilight phase before true night begins.',
      'Most stars are visible, but the sky may still not be fully dark for faint-object work.',
      'Astronomical dusk and dawn are common boundaries for astronomy planning.',
    ],
    body:
      'Astronomical twilight is the final stage of fading sunlight. Once the Sun drops beyond 18 degrees below the horizon, the sky is considered free of direct twilight from the Sun for practical observing purposes.',
    insight:
      'Astronomical dusk is often the first truly useful start time for deep-sky observing.',
  },

  {
    id: 'astro-night-window',
    title: 'Night Window',
    summary:
      'Night window is the broader span from evening to morning when the Sun is down and nighttime observing is possible.',
    bullets: [
      'This is larger than the true-dark window.',
      'Moonlight, twilight, haze, and clouds can still limit quality within the night window.',
      'It is useful as the overall planning envelope for outdoor astronomy.',
    ],
    body:
      'The night window is the full overnight period available between the evening and the following morning. It tells you how much total nighttime you have, while the true-dark and darkest windows tell you when the best part happens inside it.',
  },

  {
    id: 'astro-true-dark',
    title: 'True Dark',
    summary:
      'True dark is the period between astronomical dusk and astronomical dawn, when the Sun is more than 18 degrees below the horizon.',
    bullets: [
      'This is the cleanest solar-darkness period of the night.',
      'True dark does not guarantee perfect observing because moonlight and clouds can still interfere.',
      'For deep-sky observing, this is usually the most important baseline darkness window.',
    ],
    body:
      'True dark is the part of the night with no twilight contribution from the Sun. It is one of the most important milestones for astronomy because faint objects are easiest to see when the sky is free of residual sunlight.',
    insight:
      'Twilight ending is good. True dark beginning is when the night becomes fully usable.',
  },

  {
    id: 'astro-best-window',
    title: 'Best Observing Window',
    summary:
      'The best observing window is the forecast blend of darkness, cloud cover, visibility, moonlight, and other factors that gives the highest-quality stretch of the night.',
    bullets: [
      'It is a forecast convenience metric, not a single astronomy standard.',
      'It can begin after true dark if clouds or moonlight improve later.',
      'It is meant to answer “when should I actually go outside?”',
    ],
    body:
      'Best observing window combines multiple sky-quality factors into one practical recommendation. It is more useful than a single milestone time because it reflects the actual quality of the sky, not just the Sun’s position.',
  },

  {
    id: 'astro-sky-score',
    title: 'Sky Score',
    summary:
      'Sky Score is OMNIwx’s observing-quality score. It blends local sky darkness, cloud layers, transparency, moonlight, and atmospheric stability into one number.',
    references: [
      { label: 'Core anchors', value: 'Bortle + cloud layers' },
      { label: 'Major weather inputs', value: 'Visibility, humidity, wind, gusts' },
      { label: 'Night context', value: 'True dark, twilight, moonlight' },
      { label: 'Aerosol context', value: 'Optical depth / haze / smoke loading' },
    ],
    bullets: [
      'A higher Sky Score means the sky is more usable for observing, not just darker on paper.',
      'Bortle class sets the local darkness ceiling while cloud layers set the largest weather penalty.',
      'Moonlight, haze, humidity, and wind can all reduce the score even on an otherwise clear night.',
    ],
    body:
      'Sky Score is designed to answer a practical question: “Is tonight actually worth going out for?” It is not a formal astronomy standard. OMNIwx uses it as a forecast convenience metric that starts with local site darkness and cloud structure, then adjusts for transparency, moonlight, and stability.',
    insight:
      'A true-dark time alone can still be disappointing. Sky Score is meant to catch the difference between dark and usable.',
  },

  {
    id: 'astro-darkest-window',
    title: 'Darkest Window',
    summary:
      'The darkest window is the part of the night when moonlight and solar twilight combine to produce the lowest sky brightness.',
    bullets: [
      'Darkest does not always mean best if clouds or haze are worse then.',
      'This can differ from the best observing window when transparency, cloud cover, or seeing shift.',
      'It is especially useful for faint-object observers who care about the absolute darkest sky.',
    ],
    body:
      'Darkest window focuses on sky darkness itself rather than overall observing quality. It is the best marker for when the sky background should be at its least bright, which matters most for deep-sky observing and astrophotography.',
  },

  {
    id: 'astro-baseline-brightness',
    title: 'Baseline Sky Brightness',
    summary:
      'Baseline sky brightness is the local site brightness estimate before tonight’s changing moonlight, twilight, clouds, and haze are applied.',
    references: [
      { label: 'Best use', value: 'Comparing observing sites' },
      { label: 'Main driver', value: 'Light pollution / Bortle class' },
      { label: 'Unit', value: 'mcd/m², where lower is darker' },
    ],
    bullets: [
      'It describes the site itself, not the exact sky at this minute.',
      'A city site can have a bright baseline even on a cloudless moon-free night.',
      'When direct luminance is unavailable, OMNIwx derives a practical estimate from the Bortle class.',
    ],
    body:
      'Baseline brightness is the starting point for the sky model. Think of it as the local darkness ceiling: how dark the sky can reasonably get at that location before weather and moon timing change the live conditions.',
    insight:
      'Lower baseline brightness means the location has more dark-sky potential.',
  },

  {
    id: 'astro-estimated-brightness',
    title: 'Estimated Brightness Now',
    summary:
      'Estimated brightness now adjusts the site baseline for the current light state, including twilight and whether the Moon is up.',
    references: [
      { label: 'Starts with', value: 'Baseline sky brightness' },
      { label: 'Adjusts for', value: 'Twilight + moon illumination' },
      { label: 'Interpretation', value: 'Lower is better for faint objects' },
    ],
    bullets: [
      'Civil, nautical, and astronomical twilight brighten the sky before true night settles in.',
      'Moonlight can raise sky brightness substantially when the Moon is above the horizon.',
      'This is an estimate, not a direct sky-quality meter reading.',
    ],
    body:
      'Estimated brightness now is OMNIwx’s practical live approximation of the sky background. It starts with the local site brightness and applies broad adjustments for solar twilight and moonlight so the number better matches what an observer would experience right now.',
    insight:
      'A good baseline site can still be bright right now if the Moon is up or twilight has not ended.',
  },

  {
    id: 'astro-aerosols',
    title: 'Aerosols',
    summary:
      'Aerosols are tiny particles in the air, including dust, smoke, haze, and pollution, that reduce sky transparency.',
    references: [
      { label: 'Astronomy effect', value: 'Lower contrast and transparency' },
      { label: 'Common sources', value: 'Smoke, dust, haze, pollution' },
      { label: 'Different from', value: 'Cloud cover' },
    ],
    bullets: [
      'A clear sky can still be hazy if aerosol loading is high.',
      'Aerosols scatter light, which can brighten the background sky near cities or moonlight.',
      'Cleaner aerosol readings usually mean better contrast for stars, planets, and deep-sky objects.',
    ],
    body:
      'Aerosols affect how transparent the atmosphere is. They are not clouds, but they can still soften stars, reduce distant visibility, and make the sky background brighter by scattering nearby light sources.',
    insight:
      'For observing, clear is not always transparent. Aerosols help explain that difference.',
  },

  {
    id: 'aviation-metar',
    title: 'METAR (current airport weather report)',
    summary:
      'A METAR is the routine current observation for an airport or station. It gives the latest wind, visibility, clouds, temperature, dew point, altimeter, and present weather.',
    references: [
      { label: 'Purpose', value: 'Current observed conditions' },
      { label: 'Typical cadence', value: 'Hourly, with specials as needed' },
      { label: 'Best use', value: 'What is happening right now' },
    ],
    bullets: [
      'METAR is observational, not forecast.',
      'Pilots use it for current field conditions and flight category.',
      'Raw METAR strings are compact, but decoded fields are easier for most users.',
    ],
    body:
      'A METAR is the standard surface weather observation used in aviation. It is one of the most important products for understanding the current state of a field before departure, arrival, or diversion planning.',
    insight:
      'If you want to know what the airport is doing right now, METAR is usually the first place to look.',
  },

  {
    id: 'aviation-taf',
    title: 'TAF (terminal forecast)',
    summary:
      'A TAF is the forecast for expected weather conditions at an airport terminal over the coming hours.',
    references: [
      { label: 'Purpose', value: 'Forecast conditions at the field' },
      { label: 'Typical window', value: '24 to 30 hours' },
      { label: 'Best use', value: 'Departure and arrival planning' },
    ],
    bullets: [
      'TAF is a forecast, not an observation.',
      'It focuses on airport terminal conditions rather than the full route.',
      'Change groups tell you when forecasters expect conditions to shift.',
    ],
    body:
      'TAFs help pilots plan around expected wind, visibility, ceiling, and weather changes at departure and destination airports. They are especially useful when current conditions are fine but forecast deterioration is expected later.',
    insight:
      'METAR tells you what is happening now. TAF tells you what is expected next.',
  },

  {
    id: 'aviation-flight-category',
    title: 'Flight Category (VFR, MVFR, IFR, LIFR)',
    summary:
      'Flight category is a shorthand classification based mainly on ceiling and visibility. It gives a quick read on how restrictive current field conditions are.',
    references: [
      { label: 'VFR', value: 'Ceiling > 3000 ft and visibility > 5 sm' },
      { label: 'MVFR', value: 'Ceiling 1000-3000 ft or visibility 3-5 sm' },
      { label: 'IFR', value: 'Ceiling 500-1000 ft or visibility 1-3 sm' },
      { label: 'LIFR', value: 'Ceiling < 500 ft or visibility < 1 sm' },
    ],
    bullets: [
      'The lower category wins if either ceiling or visibility is restrictive.',
      'This is a fast summary, not a complete briefing.',
      'Even VFR can still hide wind, convection, or icing concerns.',
    ],
    body:
      'Flight category is widely used because it compresses a lot of operational meaning into one label. It is especially helpful for scanning multiple stations quickly.',
  },

  {
    id: 'aviation-turbulence',
    title: 'Aviation Turbulence',
    summary:
      'Aviation turbulence is rough or irregular air that can affect comfort, handling, and sometimes safety. It can come from terrain, convection, wind shear, or strong flow aloft.',
    references: [
      { label: 'Light', value: 'Noticeable bumps' },
      { label: 'Moderate', value: 'More persistent roughness' },
      { label: 'Severe', value: 'Abrupt altitude and attitude changes' },
    ],
    bullets: [
      'Not all turbulence is tied to storms.',
      'Mountain waves, jet structure, and low-level wind shear can all matter.',
      'Pilot reports help confirm where it is actually being felt.',
    ],
    body:
      'Turbulence products and pilot reports help identify where the air is likely to be rough. For route planning, it matters both for ride quality and for whether conditions may be deteriorating into something operationally significant.',
  },

  {
    id: 'aviation-icing',
    title: 'Aviation Icing',
    summary:
      'Aviation icing happens when supercooled liquid water freezes on an aircraft. It can degrade lift, increase drag, and create a serious hazard quickly.',
    references: [
      { label: 'Key ingredients', value: 'Moisture + freezing temperatures + aircraft exposure' },
      { label: 'Common zones', value: 'Cloud layers and precipitation in subfreezing air' },
      { label: 'Best use', value: 'Route and altitude risk awareness' },
    ],
    bullets: [
      'Icing risk is altitude-sensitive.',
      'A route may look fine at one level and hazardous at another.',
      'Observed reports are often as valuable as forecast overlays.',
    ],
    body:
      'Icing is one of the most operationally important aviation hazards because even moderate accretion can quickly change aircraft performance. Route planning should treat forecast icing zones seriously.',
  },

  {
    id: 'aviation-pirep',
    title: 'PIREP (pilot report)',
    summary:
      'A PIREP is a direct report from a pilot describing conditions actually experienced in flight.',
    references: [
      { label: 'Best use', value: 'Reality check on forecast conditions' },
      { label: 'Common hazards', value: 'Turbulence, icing, clouds, visibility' },
      { label: 'Strength', value: 'Observed, in-the-air confirmation' },
    ],
    bullets: [
      'PIREPs are valuable because they come from actual aircraft in the environment.',
      'They can confirm or challenge what the forecast products suggest.',
      'Coverage is uneven because reports depend on traffic and reporting.',
    ],
    body:
      'Pilot reports are among the most practical aviation datasets because they tell you what conditions felt like in the real atmosphere, not just what a model or surface station estimated.',
    insight:
      'If several recent PIREPs line up with a hazard overlay, confidence in that hazard should usually go up.',
  },
  {
    id: 'front-types',
    title: 'Front Types (cold, warm, stationary, occluded)',
    summary:
      'Fronts mark boundaries between different air masses. The symbol shape tells you what kind of boundary it is and how it is moving or evolving.',
    bullets: [
      'Cold front: colder, denser air is advancing and lifting warmer air. These often bring a wind shift, a temperature drop, and sometimes a line of showers or storms.',
      'Warm front: warmer air is advancing over cooler air. These often bring a more gradual change with layered clouds, longer-lasting precipitation, and rising temperatures after passage.',
      'Stationary front: the boundary is stalled or moving very little. These can linger for a while and keep clouds, rain chances, and temperature contrasts in place.',
      'Occluded front: a colder front has overtaken a warm front, lifting the warm air off the ground. These are usually tied to mature low-pressure systems and complex precipitation patterns.',
    ],
    body:
      'On weather maps, the front symbol gives you both the front type and the direction of motion. Triangles usually mark cold fronts, semicircles mark warm fronts, alternating symbols on opposite sides mark stationary fronts, and alternating symbols on the same side mark occluded fronts.',
    insight:
      'A front is not just a line on a map. It is a transition zone where wind, temperature, moisture, clouds, and precipitation often change together.',
  },
];

