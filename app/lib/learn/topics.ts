// app/lib/learn/topics.ts
// Central Learn-more topic library (Land Wx + Space Wx)
import { OMNIWX_TUTORIAL_TOPIC } from './tutorial';
//
// Notes:
// - IDs are stable deep-link keys (via learnTopicId from NerdyExplainModal).
// - Keep aliases when renaming IDs so older links don’t break.

export type LearnReference = {
  label: string;
  value: string;
};

export type LearnSection = {
  title?: string;
  body?: string;
  bullets?: string[];
};

export type LearnCategoryId =
  | 'start'
  | 'land'
  | 'comfort'
  | 'clouds'
  | 'maps'
  | 'marine'
  | 'aviation'
  | 'space'
  | 'astro'
  | 'data';

export type LearnCategory = {
  id: LearnCategoryId;
  title: string;
  description: string;
};

export type LearnTopic = {
  id: string;
  title: string;
  category?: LearnCategoryId;
  tags?: string[];
  summary?: string;
  references?: LearnReference[];
  bullets?: string[];
  body?: string;
  sections?: LearnSection[];
  callout?: string;
  formula?: string;
  formulaLabel?: string;
  formulaNotes?: string[];
  insight?: string;
  footer?: string;
};

export const LEARN_TOPICS: LearnTopic[] = [
  OMNIWX_TUTORIAL_TOPIC,
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
    title: 'Official Alerts (what they mean)',
    summary:
      'Official alerts are hazard messages designed to communicate risk, timing, location, and action. The short headline is helpful, but the full text is where the important details usually live.',
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
    id: 'swpc-alerts',
    title: 'SWPC Watches, Warnings, and Alerts',
    summary:
      'SWPC messages are NOAA operational notices for notable space-weather conditions. They can look cryptic because they are written for operators, not casual readers.',
    references: [
      { label: 'Watch', value: 'Conditions are possible; stay aware' },
      { label: 'Warning', value: 'A threshold is expected or imminent' },
      { label: 'Alert', value: 'A threshold has been observed or exceeded' },
      { label: 'Serial number', value: 'NOAA message tracking number, not severity' },
    ],
    bullets: [
      'The headline tells you the event family, but the message code tells you the operational product.',
      'Electron and proton flux alerts are often most relevant to satellite operations.',
      'Geomagnetic watches and warnings are usually the ones aurora watchers care about most.',
      'Old alerts may stay visible for context even after the active condition has ended.',
    ],
    body:
      'SWPC alerts are concise bulletins from NOAA Space Weather Prediction Center. They tell operators what threshold was crossed, when it was issued, and what category of space-weather risk is involved.',
    sections: [
      {
        title: 'Common message families',
        bullets: [
          'ALTEF3: energetic electron flux exceeded a threshold; mostly satellite-charging relevance.',
          'ALTK: K-index or geomagnetic activity alert; more relevant to aurora and geomagnetic storm context.',
          'WARK / WATA: watch products for possible geomagnetic storm levels.',
          'SUMSUD / SUMX: flare or X-ray summaries tied to radio-blackout context.',
        ],
      },
      {
        title: 'Electron flux in plain English',
        body:
          'An Electron 2MeV Integral Flux alert means high-energy electrons near geosynchronous orbit crossed a NOAA threshold. That is interesting space weather, but it is mostly a spacecraft or satellite charging concern, not a direct ground hazard.',
      },
      {
        title: 'Why some alerts repeat',
        body:
          'NOAA may issue repeated alerts as thresholds are crossed again or as new serial messages are generated. OMNIwx keeps the latest messages visible so users can see recent operational context.',
      },
    ],
    insight:
      'For aurora: prioritize Kp, G scale, Bz, and geomagnetic watches. For satellite environment: electron and proton flux alerts become much more interesting.',
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
    formula: 'Dynamic pressure is proportional to density x speed^2',
    formulaNotes: [
      'km/s = kilometers per second, the standard speed unit for solar wind.',
      '/cm3 = particles per cubic centimeter, usually proton density.',
      'K = Kelvin, plasma temperature rather than ordinary air temperature.',
      'nT = nanotesla, a magnetic-field strength unit used for IMF Bz and Bt.',
    ],
    sections: [
      {
        title: 'What is L1?',
        body:
          'L1 is the Sun-Earth Lagrange point about 1.5 million km sunward of Earth. Spacecraft there orbit a stable gravitational region and act like upstream buoys for the solar wind.',
      },
      {
        title: 'Speed, density, and pressure',
        body:
          'Speed tells how fast the solar wind is arriving. Density tells how packed with particles it is. Together they help describe how hard the flow can press on Earth magnetosphere.',
      },
      {
        title: 'Why Bz is separate',
        body:
          'Speed and density describe the flow. Bz describes the magnetic orientation inside that flow. Southward Bz often decides whether the energy couples efficiently into Earth magnetic field.',
      },
    ],
    insight:
      'Solar wind speed tells you how hard the stream can hit. Bz tells you whether Earth magnetic field is likely to let much of that energy in.',
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
    formulaNotes: [
      'Positive Bz means northward IMF; it usually couples less efficiently.',
      'Negative Bz means southward IMF; it usually couples more efficiently.',
      'Bz and Bt are measured in nT, nanotesla.',
    ],
    sections: [
      {
        title: 'Why southward matters',
        body:
          'Earth magnetic field points mostly northward at the dayside boundary. When the incoming interplanetary magnetic field turns southward, the two fields connect more efficiently through magnetic reconnection.',
      },
      {
        title: 'How to read it',
        body:
          'A brief negative dip can be interesting. Sustained negative Bz, especially with fast solar wind and rising Kp, is much more meaningful for aurora potential.',
      },
    ],
    insight:
      'Bz is one reason a fast solar wind stream can sometimes do very little, while another similar stream produces a much better aurora show.',
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
    sections: [
      {
        title: 'What Kp is not',
        body:
          'Kp is not a cloud forecast, not a local aurora guarantee, and not an instant reading at your exact location. It is a global geomagnetic activity index.',
      },
      {
        title: 'Aurora context',
        body:
          'Higher Kp expands the auroral oval toward lower latitudes, but visibility still depends on darkness, cloud cover, moonlight, light pollution, and where the auroral oval actually sits.',
      },
    ],
    insight:
      'A low Kp should not show a fake aurora promise. It means the geomagnetic environment is quiet unless other local and visual context says otherwise.',
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
    id: 'earth-disk',
    title: 'Earth Disk Views',
    summary:
      'Earth disk imagery gives the Space Weather screen visual context for the day-night terminator and full-disk cloud patterns from NOAA geostationary satellites.',
    references: [
      { label: 'GOES-East', value: 'NOAA GOES-19 over the Americas and Atlantic sector' },
      { label: 'GOES-West', value: 'NOAA GOES-18 over the Pacific and western North America sector' },
      { label: 'GeoColor', value: 'Visible-style daytime color blended with infrared at night' },
    ],
    bullets: [
      'The terminator is the moving boundary between day and night.',
      'GOES satellites sit in geostationary orbit, so each one stares at the same hemisphere continuously.',
      'The terminator views update much more reliably than the older L1 Earth option.',
    ],
    body:
      'These images are visual context layers, not weather model fields. They help show where daylight, nighttime, and broad cloud patterns sit relative to Earth. GOES-East and GOES-West are parked over the equator in geostationary orbit about 35,786 km above Earth, which lets them refresh the same full-disk view frequently.',
    sections: [
      {
        title: 'Why this is not L1 anymore',
        body:
          'The L1 Earth image came from a much farther upstream spacecraft view and could feel more orbital, but it was often stale. OMNIwx now favors the GOES terminator views because they are timely and visually explain day versus night better.',
      },
      {
        title: 'What GeoColor is showing',
        body:
          'During daylight, GeoColor resembles natural-color visible imagery. At night, it uses infrared information so clouds and the dark side of Earth remain visible while the terminator stays obvious.',
      },
    ],
  },
  {
    id: 'mars-insight-weather',
    title: 'Mars InSight Weather Archive',
    summary:
      'NASA InSight measured temperature, pressure, and wind from Elysium Planitia on Mars before the mission ended.',
    references: [
      { label: 'Mission', value: 'NASA InSight' },
      { label: 'Location', value: 'Elysium Planitia' },
      { label: 'Status', value: 'Archived, not live' },
    ],
    bullets: [
      'This is historical Mars weather context, not an active forecast.',
      'Pressure and temperature on Mars behave very differently from Earth weather.',
      'The archive is useful as a science reference and comparison point.',
    ],
    body:
      'The InSight lander provided one of the clearest public surface-weather records from Mars. OMNIwx keeps it separated from live Earth and solar weather so it reads as a preserved archive rather than a current operational product.',
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
  {
    id: 'radar-base-reflectivity',
    title: 'Radar Base Reflectivity',
    summary:
      'Base reflectivity shows how much energy is returned to the radar from precipitation, hail, insects, and other targets in the lowest available scan.',
    bullets: [
      'Higher values usually mean heavier precipitation or hail potential.',
      'Shape and texture matter: hooks, bows, cores, and gradients can reveal storm structure.',
      'Reflectivity does not show wind direction; use velocity for motion toward or away from the radar.',
    ],
    body:
      'In station radar mode this comes from a selected NEXRAD site rather than a national mosaic, so local storm structure should stay sharper when you zoom in.',
    insight:
      'Reflectivity answers "where is the precipitation and how intense is it?"',
  },
  {
    id: 'radar-base-velocity',
    title: 'Radar Base Velocity',
    summary:
      'Base velocity shows motion toward or away from the radar along the beam. It is the core product for inspecting wind signatures.',
    bullets: [
      'Inbound and outbound colors depend on the radar site location, not north/south motion.',
      'Tight adjacent inbound/outbound couplets can suggest rotation.',
      'Velocity is easiest to interpret when you know where the selected radar site is.',
    ],
    body:
      'Because velocity is radial, the same storm can look different from different radar sites. Range rings and the station marker help orient the wind field.',
    insight:
      'Velocity answers "how is air moving relative to this radar?"',
  },
  {
    id: 'radar-storm-relative-velocity',
    title: 'Storm Relative Velocity',
    summary:
      'Storm relative velocity removes estimated storm motion from base velocity so rotation and storm-scale wind signatures stand out more clearly.',
    bullets: [
      'Useful for supercell rotation and mesocyclone inspection.',
      'Depends on a storm motion estimate, so context matters.',
      'Best read alongside base velocity and reflectivity.',
    ],
    insight:
      'SRV tries to subtract the storm translation so the internal wind field is easier to see.',
  },
  {
    id: 'radar-correlation-coefficient',
    title: 'Correlation Coefficient',
    summary:
      'Correlation coefficient compares how similarly horizontal and vertical radar pulses behave. It helps identify mixed target types.',
    bullets: [
      'Lower values can indicate hail, debris, melting snow, or non-meteorological targets.',
      'In tornado warning work, a low-CC area collocated with rotation can be important.',
      'It should be interpreted with reflectivity and velocity, not alone.',
    ],
  },
  {
    id: 'radar-differential-reflectivity',
    title: 'Differential Reflectivity',
    summary:
      'Differential reflectivity compares horizontal and vertical returned energy, which can reveal drop shape and hydrometeor type.',
    bullets: [
      'Large raindrops often produce higher positive values.',
      'Hail can reduce or complicate the signal.',
      'ZDR columns can help diagnose strong storm updrafts.',
    ],
  },
  {
    id: 'radar-echo-tops',
    title: 'Echo Tops',
    summary:
      'Echo tops estimate how high meaningful radar returns extend in a storm.',
    bullets: [
      'Higher echo tops often point to deeper convection.',
      'They are useful for storm growth and aviation awareness.',
      'They do not directly measure cloud top temperature or lightning risk.',
    ],
  },
  {
    id: 'radar-vil',
    title: 'Vertically Integrated Liquid',
    summary:
      'VIL estimates the total liquid water content in a vertical column above a point.',
    bullets: [
      'High VIL can flag intense precipitation cores.',
      'Very high values may suggest hail potential in the right storm environment.',
      'VIL is most useful when compared with storm mode, freezing level, and reflectivity structure.',
    ],
  },
  {
    id: 'marine-sea-state',
    title: 'Marine Sea State',
    summary:
      'Sea state is the combined practical picture of waves, wind, swell, gusts, and local marine hazards.',
    references: [
      { label: 'Wave height', value: 'Usually shown as significant wave height, or Hs' },
      { label: 'Wind', value: 'Often shown in knots for marine use' },
      { label: 'Period', value: 'Seconds between dominant waves' },
      { label: 'Direction', value: 'Where waves or wind are coming from' },
    ],
    bullets: [
      'A small wave height can still feel rough if the period is short or wind opposes the swell.',
      'Long-period swell can carry more energy and produce larger sets near shoals, bars, and beaches.',
      'Official marine forecasts should win over any heuristic score when planning real trips.',
    ],
    insight:
      'Sea state is not one number. It is the shape, timing, direction, and energy of the water.',
  },
  {
    id: 'significant-wave-height',
    title: 'Significant Wave Height (Hs)',
    summary:
      'Significant wave height is roughly the average height of the highest one-third of waves in a sea state.',
    references: [
      { label: 'Hs', value: 'Significant wave height' },
      { label: 'm', value: 'Meters' },
      { label: 'ft', value: 'Feet' },
      { label: 'Rule of thumb', value: 'Individual waves can be meaningfully taller than Hs' },
    ],
    formula: 'Hs = average height of the highest one-third waves',
    bullets: [
      'Hs is not the maximum wave.',
      'Occasional larger waves happen naturally because waves arrive in groups.',
      'For boating, combine Hs with period, wind, gusts, and direction.',
    ],
  },
  {
    id: 'wave-period',
    title: 'Wave Period (Tp)',
    summary:
      'Wave period is the time in seconds between dominant waves. Longer periods usually mean more energetic swell.',
    references: [
      { label: 'Tp', value: 'Dominant or peak period' },
      { label: 's', value: 'Seconds' },
      { label: 'Short period', value: 'Often choppy, locally wind-driven seas' },
      { label: 'Long period', value: 'Often more organized, energetic swell' },
    ],
    bullets: [
      'Two seas with the same height can feel very different if their periods differ.',
      'Short-period steep waves can be uncomfortable and wet.',
      'Long-period swell can surprise beaches, bars, and shallow-water zones.',
    ],
  },
  {
    id: 'wave-direction',
    title: 'Wave Direction',
    summary:
      'Wave direction is the direction waves are coming from, usually shown as compass text and degrees.',
    references: [
      { label: 'deg', value: 'Degrees clockwise from north' },
      { label: 'N / E / S / W', value: 'Compass direction the waves come from' },
      { label: 'Use with wind', value: 'Wind opposing waves can steepen the sea' },
    ],
    bullets: [
      'A west swell means waves are coming from the west.',
      'Direction matters around headlands, inlets, harbors, and lee shores.',
      'Compare wave direction with wind direction to understand surface roughness.',
    ],
  },
  {
    id: 'marine-wind',
    title: 'Marine Wind (knots, gusts, direction)',
    summary:
      'Marine wind is commonly reported in knots with direction and gusts because those are operationally useful on the water.',
    references: [
      { label: 'kt', value: 'Knots, nautical miles per hour' },
      { label: '1 kt', value: 'About 1.15 mph' },
      { label: 'Gust', value: 'Short burst above sustained wind' },
      { label: 'Direction', value: 'Where the wind is coming from' },
    ],
    bullets: [
      'Sustained wind describes the background flow.',
      'Gusts often determine how rough and unpredictable the surface feels.',
      'Wind direction relative to shore and swell can matter as much as wind speed.',
    ],
  },
  {
    id: 'beaufort-scale',
    title: 'Beaufort Scale',
    summary:
      'The Beaufort scale is a practical wind force scale that connects wind speed to observed sea conditions.',
    references: [
      { label: 'F0', value: 'Calm' },
      { label: 'F4', value: 'Moderate breeze' },
      { label: 'F6', value: 'Strong breeze' },
      { label: 'F8+', value: 'Gale conditions and higher' },
    ],
    bullets: [
      'Beaufort is not a forecast model; it is a descriptive wind force scale.',
      'It helps translate knots into a more intuitive marine feel.',
      'Local fetch, tide, current, and bathymetry can make conditions rougher than the scale alone suggests.',
    ],
  },
  {
    id: 'wind-wave-interaction',
    title: 'Wind-Wave Interaction',
    summary:
      'Wind-wave interaction compares wind direction with the dominant wave direction to estimate whether the sea is organized, opposing, or confused.',
    references: [
      { label: 'Aligned', value: 'Wind roughly follows wave direction' },
      { label: 'Opposing', value: 'Wind blows against the waves' },
      { label: 'Cross sea', value: 'Wind crosses the waves near right angles' },
      { label: 'deg', value: 'Angular difference in degrees' },
    ],
    formula: 'Wind-wave angle = smallest angular difference between wind direction and wave direction',
    bullets: [
      'Opposing wind can steepen wave faces.',
      'Cross seas can feel confused and rolly.',
      'Aligned flow usually feels more organized, though stronger wind can still build rough seas.',
    ],
  },
  {
    id: 'wave-steepness-breaking',
    title: 'Wave Steepness and Breaking Risk',
    summary:
      'Wave steepness compares wave height with wavelength. Steeper waves are more likely to break or feel harsh.',
    references: [
      { label: 'H/L', value: 'Wave height divided by wavelength' },
      { label: 'L', value: 'Estimated deep-water wavelength' },
      { label: 'm', value: 'Meters' },
      { label: 'Breaking risk', value: 'Heuristic risk based on steepness' },
    ],
    formula: 'Deep-water wavelength L is approximately 1.56 x Tp^2; steepness = Hs / L',
    formulaNotes: [
      'Tp is wave period in seconds.',
      'Hs is significant wave height.',
      'This is a scan metric, not a surf-zone or inlet safety certification.',
    ],
    bullets: [
      'Short-period waves can be steep even when they are not especially tall.',
      'Longer-period swell usually has a longer wavelength and may feel smoother offshore.',
      'Breaking risk can increase around shoals, bars, opposing current, and abrupt bathymetry.',
    ],
  },
  {
    id: 'tallest-set',
    title: 'Tallest Set Estimate',
    summary:
      'Tallest set is a rough estimate of occasional larger waves within a group, based on significant wave height.',
    references: [
      { label: 'Hs', value: 'Significant wave height' },
      { label: 'Estimate', value: 'About 1.8 x Hs in this app' },
      { label: 'ft / m', value: 'Shown in feet or meters depending on context' },
    ],
    formula: 'Tallest set estimate = 1.8 x Hs',
    bullets: [
      'This is a heuristic for scanning standout set potential.',
      'It does not predict the exact biggest wave at a point.',
      'Use it with period, wind-wave interaction, tide/current, and official forecasts.',
    ],
  },
  {
    id: 'air-sea-stability',
    title: 'Air-Sea Stability',
    summary:
      'Air-sea stability compares air temperature with sea-surface temperature to estimate how mixed or stable the near-surface marine layer may be.',
    references: [
      { label: 'Delta T', value: 'Air temperature minus sea temperature' },
      { label: 'C', value: 'Degrees Celsius' },
      { label: 'Air warmer', value: 'More stable-ish near the surface' },
      { label: 'Air colder', value: 'More unstable-ish and mixed' },
    ],
    formula: 'Delta T = air temperature - sea-surface temperature',
    bullets: [
      'Cold air over warmer water can promote mixing and punchier gusts.',
      'Warm air over cooler water can favor a more stable marine layer.',
      'This is a simple diagnostic and should be read with wind, clouds, and local marine forecasts.',
    ],
  },
  {
    id: 'marine-risk-score',
    title: 'Nautical wxLab Risk Score',
    summary:
      'The Nautical wxLab risk score is a quick scan metric built from waves, period, wind, gusts, breaking risk, and wind-wave interaction.',
    references: [
      { label: '0-100', value: 'Low to extreme heuristic score' },
      { label: 'Inputs', value: 'Hs, Tp, wind, gusts, steepness, interaction' },
      { label: 'Use', value: 'Screening and situational awareness' },
    ],
    formula:
      'Score blends normalized wave height, period, sustained wind, gust spread, breaking risk, and wind-wave interaction',
    bullets: [
      'The score is intentionally explainable and conservative.',
      'It is not a substitute for official marine warnings or local knowledge.',
      'A moderate score can still matter near bars, inlets, shoals, rocks, or lee shores.',
    ],
  },
  {
    id: 'marine-confidence',
    title: 'Marine Confidence',
    summary:
      'Marine confidence describes how complete and fresh the available inputs are for the selected area or buoy.',
    references: [
      { label: 'High', value: 'Fresh observations and useful agreement' },
      { label: 'Moderate', value: 'Usable but partial or aging data' },
      { label: 'Low', value: 'Sparse, stale, or model-heavy data' },
    ],
    bullets: [
      'Live buoy observations usually improve confidence.',
      'Fresh timestamps are better than stale observations.',
      'Cross seas, missing wave direction, or model/observation disagreement can lower confidence.',
    ],
  },
  {
    id: 'tide-predictions',
    title: 'Tide Predictions',
    summary:
      'Tide predictions estimate high and low water timing and height for a tide station.',
    references: [
      { label: 'High tide', value: 'Predicted local water high point' },
      { label: 'Low tide', value: 'Predicted local water low point' },
      { label: 'ft', value: 'Feet relative to the station datum' },
    ],
    bullets: [
      'Tides are station-based predictions, not live water-level observations unless labeled that way.',
      'Wind, pressure, surge, river flow, and local bathymetry can make actual water levels differ.',
      'For navigation, use official tide/current products and local notices.',
    ],
  },
  {
    id: 'buoy-observations',
    title: 'Buoy Observations',
    summary:
      'Buoy observations are live or recent measurements from marine stations such as NOAA NDBC buoys.',
    references: [
      { label: 'NDBC', value: 'National Data Buoy Center' },
      { label: 'Observed time', value: 'Timestamp of the station measurement' },
      { label: 'Wave, wind, temp', value: 'Common buoy fields when available' },
    ],
    bullets: [
      'Different stations report different sensors.',
      'Some buoys report waves but not water temperature, or wind but not wave direction.',
      'Fresh observations are valuable, but always compare them with the forecast and surrounding stations.',
    ],
  },
  {
    id: 'marine-units',
    title: 'Marine Units',
    summary:
      'Marine weather mixes nautical, metric, and weather-specific units. Nautical wxLab tries to show units directly beside each value.',
    references: [
      { label: 'ft', value: 'Feet, common for wave height and tide height in US products' },
      { label: 'm', value: 'Meters, common for model wave calculations' },
      { label: 'kt', value: 'Knots, nautical miles per hour' },
      { label: 's', value: 'Seconds, usually wave period' },
      { label: 'deg', value: 'Degrees clockwise from north' },
      { label: 'C', value: 'Degrees Celsius, often used in marine sensor feeds' },
      { label: 'hPa', value: 'Hectopascals, pressure unit equivalent to millibars' },
      { label: 'nm', value: 'Nautical miles, often used for visibility and distance offshore' },
    ],
    insight:
      'The unit is part of the forecast. A wave height, period, and direction only become useful when their units are obvious.',
  },
  {
    id: 'aqi-scale',
    title: 'AQI Scale',
    category: 'land',
    tags: ['air quality', 'aqi', 'pollution', 'health'],
    summary:
      'AQI turns several pollutants into one public-health scale. It is useful for quick decisions, but the pollutant driving the number matters too.',
    references: [
      { label: '0-50', value: 'Good' },
      { label: '51-100', value: 'Moderate' },
      { label: '101-150', value: 'Unhealthy for sensitive groups' },
      { label: '151-200', value: 'Unhealthy' },
      { label: '201+', value: 'Very unhealthy to hazardous' },
    ],
    bullets: [
      'AQI is not a weather variable. It is a health-oriented index.',
      'Two places can have the same AQI for different reasons, such as ozone, smoke, or dust.',
      'Hourly AQI can move quickly near wildfire smoke, inversions, traffic corridors, and dust events.',
    ],
    sections: [
      {
        title: 'Why it belongs with weather',
        body:
          'Wind, mixing, sunlight, humidity, and stable air all affect how pollution builds, disperses, or reacts. AQI gives the human impact of those atmospheric conditions.',
      },
    ],
  },
  {
    id: 'air-pollutants',
    title: 'Air Pollutants: PM2.5, PM10, Ozone, NO2, SO2, CO',
    category: 'land',
    tags: ['aqi', 'pm2.5', 'pm10', 'ozone', 'smoke', 'dust'],
    summary:
      'The AQI number is driven by individual pollutants. Knowing the driver helps explain whether the problem is smoke, dust, photochemical smog, or combustion.',
    references: [
      { label: 'PM2.5', value: 'Fine particles, often smoke or combustion' },
      { label: 'PM10', value: 'Coarser particles, often dust' },
      { label: 'O3', value: 'Ground-level ozone, sunlight chemistry' },
      { label: 'NO2 / SO2 / CO', value: 'Combustion and industrial gases' },
    ],
    bullets: [
      'PM2.5 is small enough to get deep into lungs and is common in wildfire smoke.',
      'PM10 often rises with dust, dry soils, construction, or strong outflow winds.',
      'Ozone is usually a daytime chemistry problem and can peak away from the emissions source.',
    ],
  },
  {
    id: 'alerts-watches-warnings',
    title: 'Watches, Warnings, Advisories, and Statements',
    category: 'land',
    tags: ['alerts', 'warnings', 'watches', 'nws'],
    summary:
      'Alert words describe urgency and confidence. They are not interchangeable, and the exact hazard text matters.',
    references: [
      { label: 'Warning', value: 'Hazard is occurring or imminent' },
      { label: 'Watch', value: 'Conditions are favorable' },
      { label: 'Advisory', value: 'Less severe, still disruptive' },
      { label: 'Statement', value: 'Follow-up or special information' },
    ],
    bullets: [
      'Always read the timing, location, impacts, and instructions.',
      'A broad alert area can include places with very different actual risk.',
      'For marine and aviation, official text often contains area-specific detail that maps alone cannot show.',
      'Issued, updated, extended, upgraded, replaced, and cancelled describe the alert lifecycle. An update may change timing, wording, or affected locations without changing the hazard name.',
    ],
  },
  {
    id: 'spc-convective-outlook',
    title: 'SPC Convective Outlooks',
    category: 'maps',
    tags: ['spc', 'severe', 'outlook', 'tornado', 'hail', 'wind', 'thunderstorm'],
    summary:
      'Storm Prediction Center outlooks describe the organized severe-thunderstorm environment over a broad area. They provide planning context, not a promise that every location inside a risk area will have a storm.',
    references: [
      { label: 'TSTM', value: 'General thunderstorm potential' },
      { label: 'MRGL', value: 'Marginal risk' },
      { label: 'SLGT', value: 'Slight risk' },
      { label: 'ENH', value: 'Enhanced risk' },
      { label: 'MDT / HIGH', value: 'Moderate or high risk' },
    ],
    bullets: [
      'The categorical outlook combines the expected coverage, intensity, and confidence of severe storms.',
      'Tornado, damaging-wind, and large-hail probabilities are separate layers. The highest probability helps identify the primary hazard, but multiple hazards can occur together.',
      'An outlook can be active with no watch or warning. Watches are issued closer to the event when conditions support a more focused threat.',
      'Warnings are short-fuse products for storms that are occurring or considered imminent. Always follow the warning text and local instructions.',
      'Outlooks cover broad regions and can change as new observations and model guidance arrive.',
    ],
    sections: [
      {
        title: 'How OMNIwx uses it',
        body:
          'Severe Setup checks the official SPC Day 1 categorical, tornado, hail, and wind outlooks at the selected location. It combines that context with active NWS watches and recent alert lifecycle changes.',
      },
      {
        title: 'What the percentages mean',
        body:
          'The probability layers express the chance of a qualifying severe-weather report near a point during the outlook period. They are not the chance of rain and should not be read as a minute-by-minute forecast.',
      },
    ],
    insight:
      'Use the outlook for the setup, watches for growing concern, warnings for immediate action, and radar for storm evolution.',
  },
  {
    id: 'lightning-density',
    title: 'Lightning Density',
    category: 'maps',
    tags: ['lightning', 'glm', 'storm scope', 'thunderstorm', 'satellite'],
    summary:
      'Lightning-density products show recent storm electrification over an area. They are useful for storm awareness, but they are not a street-level lightning alert.',
    references: [
      { label: 'Official feed', value: 'NOAA OPC 15/30 min density grids' },
      { label: 'Best for', value: 'Storm electrification trends' },
      { label: 'Not for', value: 'Exact strike-by-strike safety decisions' },
      { label: 'Safety rule', value: 'When thunder roars, go indoors' },
    ],
    bullets: [
      'NOAA OPC publishes lightning-density grids that summarize lightning over recent 15-minute and 30-minute windows.',
      'Satellite GLM products detect total lightning, including in-cloud and cloud-to-cloud flashes, across broad regions.',
      'Density products summarize flashes over a grid cell or time window, so one colored area can represent many flashes.',
      'Latency, grid size, parallax, and product smoothing mean the displayed area may not match the exact ground point of a strike.',
      'OMNIwx decodes the official grids in the worker and renders a compact georeferenced density layer in Storm Scope.',
    ],
    sections: [
      {
        title: 'How to read it',
        body:
          'Look for growing or persistent lightning cores near radar echoes. Increasing lightning can suggest strengthening updrafts or more active convection.',
      },
      {
        title: 'Limitation',
        body:
          'If you can hear thunder or see lightning, use real-world safety behavior immediately regardless of what any app layer shows.',
      },
    ],
    insight:
      'Lightning density is a storm-awareness layer. It tells you storms are electrically active, not that a precise point is safe.',
  },
  {
    id: 'wpc-excessive-rainfall',
    title: 'WPC Excessive Rainfall Outlook',
    category: 'maps',
    tags: ['wpc', 'excessive rainfall', 'flash flood', 'flooding', 'qpf'],
    summary:
      'The Weather Prediction Center Excessive Rainfall Outlook highlights areas where rainfall may exceed flash-flood guidance during the outlook period.',
    references: [
      { label: 'MRGL', value: 'At least 5% chance of flash flooding nearby' },
      { label: 'SLGT', value: 'At least 15% chance' },
      { label: 'MDT', value: 'At least 40% chance' },
      { label: 'HIGH', value: 'At least 70% chance' },
    ],
    bullets: [
      'The outlook is about flash-flood potential, not simply the chance of rain.',
      'Urban areas, burn scars, steep terrain, washes, small streams, and poor-drainage roads can respond faster than larger rivers.',
      'The Day 1 product can update multiple times per day as the setup changes.',
      'Use this with radar, alerts, river stages, and local NWS text for a fuller flood picture.',
    ],
    insight:
      'A low rain chance and an excessive-rain area can both be true if storms are localized but capable of producing high rainfall rates.',
  },
  {
    id: 'nwps-river-stages',
    title: 'NWPS River Stages',
    category: 'maps',
    tags: ['nwps', 'river', 'flood', 'stage', 'forecast'],
    summary:
      'The National Water Prediction Service shows observed and forecast river stages for official river forecast points.',
    references: [
      { label: 'Observed stage', value: 'What the gauge reports now' },
      { label: 'Forecast stage', value: 'Official river forecast guidance' },
      { label: 'Flood categories', value: 'Action, minor, moderate, major' },
    ],
    bullets: [
      'River stage is height relative to a local gauge datum, not water depth everywhere along the river.',
      'Flood categories are defined locally because each river reach has different impacts.',
      'Forecast stages depend on rainfall, runoff, upstream flow, reservoirs, snowmelt, and hydrologic model guidance.',
      'Some gauges have observations only, while others include official forecast hydrographs.',
    ],
    insight:
      'River stages are a slower, hydrologic view of flood risk. They complement fast radar and excessive-rainfall layers.',
  },
  {
    id: 'nws-heatrisk',
    title: 'NWS HeatRisk',
    category: 'land',
    tags: ['heat', 'heatrisk', 'health', 'nws', 'cdc'],
    summary:
      'NWS HeatRisk is a color-number index for potential heat-related impacts over a 24-hour period. It supplements official heat watches, warnings, and advisories.',
    references: [
      { label: '0', value: 'Little to no risk' },
      { label: '1', value: 'Minor' },
      { label: '2', value: 'Moderate' },
      { label: '3', value: 'Major' },
      { label: '4', value: 'Extreme' },
    ],
    bullets: [
      'HeatRisk considers how unusual the heat is, how long it lasts, and whether overnight temperatures allow recovery.',
      'It is especially useful for people sensitive to heat, outdoor workers, events, pets, and places without reliable cooling.',
      'HeatRisk is not the same thing as heat index. Heat index estimates how hot it feels from temperature and humidity.',
      'Official local NWS heat alerts still matter; HeatRisk is additional decision support.',
    ],
    insight:
      'HeatRisk is the impact lens. Heat index is the feels-like physics lens.',
  },
  {
    id: 'nhc-tropical-weather',
    title: 'NHC Tropical Weather',
    category: 'maps',
    tags: ['nhc', 'tropical', 'hurricane', 'cyclone', 'cone', 'track'],
    summary:
      'National Hurricane Center products show tropical development areas, active storm tracks, forecast cones, wind radii, watches, and warnings where official storms or outlook areas exist.',
    references: [
      { label: 'Outlook', value: 'Potential development area' },
      { label: 'Track', value: 'Forecast center positions' },
      { label: 'Cone', value: 'Historical track-error envelope' },
      { label: 'Wind radii', value: 'Potential wind field size' },
    ],
    bullets: [
      'The cone is not an impact cone. Hazards can extend far outside it, especially rain, surge, tornadoes, and large wind fields.',
      'A tropical outlook area means forecasters are monitoring development potential, not that a named storm exists yet.',
      'Forecast tracks and wind radii update with advisories, typically every six hours and more often when needed.',
      'Always read official watches, warnings, and local emergency guidance for decisions near the coast.',
    ],
    insight:
      'Tropical mode is about the whole hazard envelope, not just the skinny line down the middle.',
  },
  {
    id: 'area-forecast-discussion',
    title: 'Area Forecast Discussion (AFD)',
    category: 'land',
    tags: ['nws', 'afd', 'forecast discussion', 'wxlab'],
    summary:
      'The AFD is where local NWS forecasters explain the thinking behind the forecast. It is often the best place to understand what changed, what is uncertain, and what forecasters are watching.',
    references: [
      { label: 'Issued by', value: 'Local NWS Weather Forecast Office' },
      { label: 'Best for', value: 'Reasoning, timing, uncertainty, forecast changes' },
      { label: 'Format', value: 'Technical discussion split into sections' },
    ],
    bullets: [
      'The AFD is not a simple forecast. It is the forecaster desk notes behind the forecast.',
      'Useful sections often include Short Term, Long Term, Aviation, Marine, Fire Weather, and Hydrology.',
      'Confidence language matters. Forecasters often say when model agreement is strong or when uncertainty is high.',
    ],
    sections: [
      {
        title: 'How OMNIwx uses it',
        body:
          'NWS Desk pulls the latest local AFD and summarizes the most useful operational pieces: headline, hazards, timing, and confidence. The raw discussion remains available because the full text can include nuance that a summary cannot.',
      },
      {
        title: 'What to look for',
        bullets: [
          'Timing words such as this afternoon, tonight, overnight, or after sunset.',
          'Hazard words such as severe, flooding, fog, snow, heat, wind, or fire weather.',
          'Confidence words such as high confidence, low confidence, uncertainty, or model spread.',
        ],
      },
    ],
    insight:
      'If the regular forecast says what, the AFD often explains why.',
  },
  {
    id: 'hazardous-weather-outlook',
    title: 'Hazardous Weather Outlook (HWO)',
    category: 'land',
    tags: ['nws', 'hwo', 'hazards', 'outlook'],
    summary:
      'The HWO is a plain-language NWS product that calls out potential hazardous weather for the next several days.',
    references: [
      { label: 'Focus', value: 'Potential hazards and timing' },
      { label: 'Time range', value: 'Usually today through the extended forecast' },
      { label: 'Tone', value: 'Broader outlook, not always an active warning' },
    ],
    bullets: [
      'The HWO can mention hazards before watches or warnings are issued.',
      'It may cover a broad forecast area, so local impacts can vary.',
      'It is especially helpful for thunderstorms, winter weather, flooding, heat, wind, fire weather, and fog.',
    ],
    insight:
      'Think of HWO as the local office saying, "Here is what could cause trouble."',
  },
  {
    id: 'nws-weather-story',
    title: 'NWS Weather Story',
    category: 'land',
    tags: ['nws', 'weather story', 'briefing'],
    summary:
      'A Weather Story is a local NWS briefing-style graphic or narrative. It is useful when available, but it is not published in one perfectly standardized API format everywhere.',
    bullets: [
      'Weather Stories are designed for quick public understanding.',
      'Availability and freshness vary by office.',
      'OMNIwx can use AFD and HWO as a reliable fallback when Weather Story content is missing or stale.',
    ],
    insight:
      'Weather Story is the polished briefing board; AFD/HWO are the more reliable text backbone.',
  },
  {
    id: 'local-storm-reports',
    title: 'Local Storm Reports (LSR)',
    category: 'maps',
    tags: ['nws', 'lsr', 'storm reports', 'hail', 'wind', 'tornado', 'flood'],
    summary:
      'Local Storm Reports are official NWS bulletins that record notable storm impacts reported by spotters, emergency managers, law enforcement, the public, sensors, and NWS staff.',
    references: [
      { label: 'LSR', value: 'Local Storm Report' },
      { label: 'Common events', value: 'Hail, damaging wind, tornado, flooding, snow, heavy rain, dust, measured gusts' },
      { label: 'Status', value: 'Usually preliminary until reviewed' },
    ],
    bullets: [
      'LSRs are reports of what happened, not forecasts of what will happen next.',
      'A report point marks the report location, not the full footprint of the storm impact.',
      'Some offices issue many reports during active weather; quiet offices may have none for days.',
      'Distances are approximate because reports can reference towns, roads, spotter positions, or sensor locations.',
    ],
    sections: [
      {
        title: 'How OMNIwx uses them',
        body:
          'Storm Recap scans recent official LSR products from the local NWS office and summarizes the count, closest report, latest report, strongest wind report, and largest hail report when those are present.',
      },
      {
        title: 'What not to assume',
        bullets: [
          'No reports does not guarantee no impacts.',
          'A report can be delayed or corrected later.',
          'Magnitude fields vary by event type and may be blank for reports like flooding, dust, or funnel clouds.',
        ],
      },
    ],
    insight:
      'LSRs are the storm logbook. They are excellent for recap and verification, but they are not a substitute for warnings or radar.',
  },
  {
    id: 'forecast-models',
    title: 'Forecast Models',
    category: 'data',
    tags: ['forecast', 'models', 'open-meteo', 'gfs', 'ecmwf', 'icon'],
    summary:
      'Forecast models are computer simulations of the atmosphere. OMNIwx lets you choose which Open-Meteo forecast model drives wxLab and forecast views.',
    references: [
      { label: 'Best match', value: 'Open-Meteo selects the model it expects to perform best for the location' },
      { label: 'NOAA GFS', value: 'Global Forecast System, broad global coverage from NOAA' },
      { label: 'ECMWF', value: 'European global model, often strong for large-scale patterns' },
      { label: 'DWD ICON', value: 'German Weather Service model with strong regional detail where available' },
    ],
    bullets: [
      'Best match is the safest default because availability and skill vary by region.',
      'A single model can be very good at the broad pattern and still miss local timing, terrain, clouds, or storms.',
      'Switching models is useful when you want to compare temperature, wind, cloud, and precipitation timing against the default.',
      'Model choice affects forecast and wxLab views that use Open-Meteo forecast data. Official alerts and observations still come from their own sources.',
    ],
    sections: [
      {
        title: 'How to read model differences',
        body:
          'If two models agree, confidence is usually higher. If they disagree on timing, temperature, wind, or precipitation, the forecast is more conditional. That disagreement is often more useful than any one number by itself.',
      },
      {
        title: 'When to change models',
        bullets: [
          'Use Best match for everyday forecasting.',
          'Try GFS for a broad global baseline.',
          'Try ECMWF when you want another global perspective on the larger pattern.',
          'Try ICON where regional detail may help, especially if Best match looks suspicious.',
        ],
      },
    ],
    insight:
      'A model is guidance, not truth. The best forecast combines model guidance, observations, radar, alerts, and local forecaster reasoning.',
  },
  {
    id: 'forecast-confidence',
    title: 'Forecast Confidence',
    category: 'data',
    tags: ['forecast', 'confidence', 'models', 'uncertainty'],
    summary:
      'Forecast confidence describes how much trust forecasters have in a specific outcome. It changes by hazard, place, and time.',
    references: [
      { label: 'Higher confidence', value: 'Models, observations, and pattern recognition agree' },
      { label: 'Lower confidence', value: 'Model spread, weak forcing, local terrain effects, or timing uncertainty' },
      { label: 'Forecast vs reality', value: 'Compare the forecast hour with a fresh nearby station observation' },
      { label: 'Not specified', value: 'The source did not clearly state confidence' },
    ],
    bullets: [
      'Confidence is not the same thing as severity. A low-confidence severe threat can still matter.',
      'Confidence can be high for temperature but low for storm timing on the same day.',
      'NWS discussions often explain uncertainty better than a single icon or percent value can.',
      'OMNIwx compares the selected Open-Meteo model with the current NWS forecast period, then checks the nearest official station when its observation is fresh enough.',
      'A station can differ from your exact location because of distance, elevation, pavement, terrain, or local exposure. The station name, distance, and observation age are part of the evidence.',
      'Forecast verification describes how the forecast is performing now. It does not guarantee that later forecast hours will have the same error.',
    ],
  },
  {
    id: 'thunderstorm-risk',
    title: 'Thunderstorm Risk',
    category: 'clouds',
    tags: ['thunderstorm', 'lightning', 'cape', 'convection'],
    summary:
      'Thunderstorm wording means the atmosphere can support convection, but it does not always mean heavy rain at your exact point.',
    references: [
      { label: 'Ingredients', value: 'Moisture, instability, lift, wind shear' },
      { label: 'Point forecast', value: 'One location estimate' },
      { label: 'Radar', value: 'What is happening now' },
    ],
    bullets: [
      'A thunderstorm condition can appear with a low all-day precipitation chance if storms are isolated or brief.',
      'Lightning risk is not the same thing as rainfall amount.',
      'Use radar, alerts, and hourly timing to understand whether the risk is nearby or just possible.',
    ],
  },
  {
    id: 'snow-level',
    title: 'Snow Level and Freezing Level',
    category: 'clouds',
    tags: ['snow', 'freezing level', 'winter'],
    summary:
      'Snow level estimates where falling precipitation is likely to reach the ground as snow, but valleys, terrain, and intensity can shift it.',
    references: [
      { label: 'Freezing level', value: 'Altitude where air reaches 32 F / 0 C' },
      { label: 'Snow level', value: 'Approximate rain-snow transition height' },
      { label: 'Wet-bulb effects', value: 'Evaporative cooling can lower snow level' },
    ],
    bullets: [
      'Snow level is not a hard line on the map.',
      'Heavy precipitation can drag colder air downward and lower snow levels.',
      'Mountains, basins, and nighttime cooling can create sharp local differences.',
    ],
  },
  {
    id: 'satellite-layers',
    title: 'Satellite Layers',
    category: 'maps',
    tags: ['satellite', 'infrared', 'true color', 'clouds'],
    summary:
      'Satellite layers show cloud fields and storm structure from above. Different products answer different questions.',
    references: [
      { label: 'True color', value: 'Daytime visible-like view' },
      { label: 'Infrared', value: 'Cloud-top temperature, day or night' },
      { label: 'Water vapor', value: 'Mid/upper-level moisture patterns' },
    ],
    bullets: [
      'True color is visually natural but depends on daylight.',
      'Infrared works at night and highlights cold, high cloud tops.',
      'Satellite is best for large-scale context; radar is better for local precipitation detail where radar exists.',
    ],
  },
  {
    id: 'radar-mosaic',
    title: 'Radar Mosaic vs Station Radar',
    category: 'maps',
    tags: ['radar', 'nexrad', 'mosaic', 'station'],
    summary:
      'A radar mosaic stitches many radars into one broad layer. Station radar keeps you closer to the native radar product for a single radar site.',
    references: [
      { label: 'Mosaic', value: 'Broad coverage, easier scanning' },
      { label: 'Station', value: 'Specific radar site and product' },
      { label: 'NEXRAD', value: 'US Doppler radar network' },
    ],
    bullets: [
      'Mosaics are convenient, but they can smooth, resample, or blend data.',
      'Station radar products expose more meteorology, such as velocity and correlation coefficient.',
      'High zoom can reveal limitations of the source resolution and tile resampling.',
    ],
  },
  {
    id: 'map-layer-performance',
    title: 'Map Layer Performance',
    category: 'maps',
    tags: ['maps', 'performance', 'animation', 'tiles'],
    summary:
      'Animated weather maps combine tiles, vector features, markers, and overlays. Too many live layers can make a phone work harder.',
    bullets: [
      'Tile animations should be cached and limited to the active layer.',
      'Dense marker layers need clustering or viewport limits.',
      'Vector polygons should be subtle, simplified where appropriate, and only interactive when useful.',
    ],
    insight:
      'The best weather map feels alive without asking every layer to be alive at the same time.',
  },
  {
    id: 'marine-zones',
    title: 'Official Marine Zones',
    category: 'marine',
    tags: ['marine', 'zones', 'offshore', 'coastal', 'forecast area'],
    summary:
      'Official marine zones are forecast areas issued by weather agencies. They are the boundary for the text forecast, not a perfect outline of equal conditions.',
    references: [
      { label: 'Coastal waters', value: 'Nearshore official forecast zones' },
      { label: 'Offshore waters', value: 'Larger zones farther from shore' },
      { label: 'High seas', value: 'Broad ocean forecast regions' },
    ],
    bullets: [
      'Zone boundaries are administrative forecast areas, not exact weather contours.',
      'Conditions can vary inside a zone, especially near capes, islands, shelves, bars, and currents.',
      'A good map should pair the official polygon with the detailed bulletin text and nearby observations.',
    ],
  },
  {
    id: 'high-seas-forecasts',
    title: 'High Seas Forecasts',
    category: 'marine',
    tags: ['marine', 'high seas', 'metarea', 'wmo', 'imo'],
    summary:
      'High seas forecasts cover large offshore and ocean regions. They are official, but their regions are broad by design.',
    references: [
      { label: 'METAREA', value: 'WMO/IMO marine forecast responsibility area' },
      { label: 'Bulletin', value: 'Official text forecast and hazards' },
      { label: 'Model point', value: 'Sampled conditions used for quick context' },
    ],
    bullets: [
      'The bulletin is often more important than the polygon shape.',
      'Official high seas text may call out subareas, gales, tropical systems, fronts, and significant seas.',
      'For routing, combine the bulletin with model fields, wave data, satellite, and local coastal forecasts.',
    ],
  },
  {
    id: 'water-stations',
    title: 'Water Stations',
    category: 'marine',
    tags: ['usgs', 'water temperature', 'water level', 'stations', 'lake'],
    summary:
      'Water stations measure rivers, lakes, reservoirs, and coastal water conditions. Each station reports only the sensors installed there.',
    references: [
      { label: 'Water temp', value: 'Temperature at a sensor location and depth' },
      { label: 'Gage height', value: 'Water level relative to station datum' },
      { label: 'Discharge', value: 'Flow rate, usually cubic feet per second in USGS feeds' },
    ],
    bullets: [
      'A lake can have several stations with different depths, exposures, and update schedules.',
      'Only recent measurements should be shown as current map values.',
      'A station with old data is still historically real, but it should not look like live weather.',
    ],
  },
  {
    id: 'aviation-units',
    title: 'Aviation Weather Units',
    category: 'aviation',
    tags: ['metar', 'taf', 'aviation', 'units'],
    summary:
      'Aviation weather uses compact, standardized units so pilots and dispatchers can read reports quickly across regions.',
    references: [
      { label: 'Wind', value: 'Degrees true and knots' },
      { label: 'Visibility', value: 'Statute miles in US METARs, meters in many international reports' },
      { label: 'Ceiling', value: 'Hundreds of feet AGL' },
      { label: 'Altimeter', value: 'inHg in US reports, hPa/QNH in many global reports' },
    ],
    bullets: [
      'Runway choice depends on wind direction, speed, gusts, and runway orientation.',
      'Flight category is driven mainly by ceiling and visibility.',
      'TAFs describe expected changes over time; METARs describe recent observed conditions.',
    ],
  },
  {
    id: 'sigmet-airmet',
    title: 'SIGMETs, AIRMETs, and Convective Advisories',
    category: 'aviation',
    tags: ['sigmet', 'airmet', 'cwa', 'aviation hazards'],
    summary:
      'Aviation hazard products highlight conditions that matter to flight safety, such as thunderstorms, turbulence, icing, mountain obscuration, and volcanic ash.',
    references: [
      { label: 'SIGMET', value: 'Significant meteorological hazard' },
      { label: 'AIRMET', value: 'Widespread lower-intensity aviation hazard' },
      { label: 'CWA', value: 'Center Weather Advisory, short-fused aviation hazard' },
    ],
    bullets: [
      'Aviation hazards are three-dimensional. Altitude matters as much as map position.',
      'Hazard polygons should be read with text, valid time, altitude layers, and route context.',
      'For flying decisions, always use official aviation weather briefings and current products.',
    ],
  },
  {
    id: 'solar-wind-density',
    title: 'Solar Wind Density',
    category: 'space',
    tags: ['solar wind', 'density', 'protons', 'units'],
    summary:
      'Solar wind density estimates how many particles are in each cubic centimeter of space near L1.',
    references: [
      { label: 'Unit', value: 'particles/cm^3' },
      { label: 'Common shorthand', value: 'protons per cubic centimeter' },
      { label: 'L1', value: 'Upstream solar wind monitor point' },
    ],
    bullets: [
      'Density is only one ingredient. Speed and magnetic field orientation matter too.',
      'Higher density can increase pressure on Earths magnetic field when paired with speed and southward Bz.',
      'The app should show this as /cm^3 or particles/cm^3, not as a corrupted character string.',
    ],
  },
  {
    id: 'solar-wind-speed',
    title: 'Solar Wind Speed',
    category: 'space',
    tags: ['solar wind', 'speed', 'km/s'],
    summary:
      'Solar wind speed is the flow speed of charged particles arriving from the Sun, measured near L1 before they reach Earth.',
    references: [
      { label: 'Typical', value: 'About 350-500 km/s' },
      { label: 'Fast stream', value: 'Often 500+ km/s' },
      { label: 'Unit', value: 'kilometers per second' },
    ],
    bullets: [
      'Fast solar wind can energize geomagnetic conditions, especially when Bz turns south.',
      'Speed alone does not guarantee aurora.',
      'Changes at L1 usually arrive at Earth after a short lead time, not instantly.',
    ],
  },
  {
    id: 'earth-terminator',
    title: 'Earth Terminator View',
    category: 'space',
    tags: ['earth', 'terminator', 'day night', 'satellite'],
    summary:
      'The terminator is the day-night boundary on Earth. It makes the global light pattern easier to understand than a flat geostationary-only view.',
    references: [
      { label: 'Terminator', value: 'Sunrise/sunset boundary on Earth' },
      { label: 'Useful for', value: 'Daylight, night side, aurora context' },
      { label: 'Source note', value: 'Use the app-displayed image source and timestamp' },
    ],
    bullets: [
      'A terminator view helps connect space weather with who is actually under darkness.',
      'Aurora visibility still depends on clouds, moonlight, light pollution, Kp, and latitude.',
      'The image should be treated as situational context, not a local forecast by itself.',
    ],
  },
  {
    id: 'cme-events',
    title: 'Coronal Mass Ejections',
    category: 'space',
    tags: ['cme', 'donki', 'solar storm'],
    summary:
      'A CME is a large eruption of solar plasma and magnetic field. If it is Earth-directed, it can drive geomagnetic storms after it arrives.',
    references: [
      { label: 'CME', value: 'Coronal mass ejection' },
      { label: 'DONKI', value: 'NASA space weather event catalog' },
      { label: 'Impact', value: 'Possible geomagnetic storm if Earth-directed' },
    ],
    bullets: [
      'Not every CME hits Earth.',
      'Arrival timing has uncertainty because CMEs evolve as they travel.',
      'Bz orientation near arrival often determines whether the impact becomes geoeffective.',
    ],
  },
  {
    id: 'solar-flare-events',
    title: 'Solar Flares',
    category: 'space',
    tags: ['flare', 'xray', 'radio blackout'],
    summary:
      'Solar flares are bursts of electromagnetic radiation from the Sun. They can affect radio communication on the sunlit side of Earth.',
    references: [
      { label: 'Classes', value: 'A, B, C, M, X' },
      { label: 'X-ray flux', value: 'Used for flare class' },
      { label: 'R scale', value: 'NOAA radio blackout scale' },
    ],
    bullets: [
      'Flares arrive at light speed, so the radio effect is essentially immediate.',
      'A flare does not automatically mean a geomagnetic storm.',
      'Geomagnetic storms usually depend on solar wind and CME magnetic structure.',
    ],
  },
  {
    id: 'global-weather-sources',
    title: 'Global Weather Sources',
    category: 'data',
    tags: ['sources', 'global', 'models', 'official'],
    summary:
      'A global weather app combines official observations, warnings, model forecasts, and specialty feeds. Coverage varies by feature and country.',
    references: [
      { label: 'Forecast models', value: 'Global coverage, consistent grids' },
      { label: 'Official agencies', value: 'Highest authority for local warnings and marine zones' },
      { label: 'Observations', value: 'Station-based and unevenly distributed' },
    ],
    bullets: [
      'Global does not mean every feature has equal resolution everywhere.',
      'Official alerts and zones are strongest where agencies publish usable public data.',
      'The app should label coverage honestly and use fallback data without pretending it is identical.',
    ],
  },
];

export const LEARN_CATEGORIES: LearnCategory[] = [
  {
    id: 'start',
    title: 'Start Here',
    description: 'Core ideas that help the whole app make sense.',
  },
  {
    id: 'land',
    title: 'Land Weather',
    description: 'Daily, hourly, alerts, air quality, pressure, visibility, and surface weather.',
  },
  {
    id: 'comfort',
    title: 'Comfort',
    description: 'Dew point, humidity, heat index, wind chill, and what the air feels like.',
  },
  {
    id: 'clouds',
    title: 'Clouds & Precip',
    description: 'Clouds, rain chance, fog, thunderstorms, snow level, and radiation.',
  },
  {
    id: 'maps',
    title: 'Maps & Radar',
    description: 'Radar products, satellite layers, fronts, map performance, and overlays.',
  },
  {
    id: 'marine',
    title: 'Marine',
    description: 'Waves, buoys, tides, water stations, official zones, and high seas forecasts.',
  },
  {
    id: 'aviation',
    title: 'Aviation',
    description: 'METARs, TAFs, flight categories, units, turbulence, icing, and hazards.',
  },
  {
    id: 'space',
    title: 'Space Weather',
    description: 'Kp, NOAA scales, solar wind, flares, CMEs, SWPC alerts, and Earth views.',
  },
  {
    id: 'astro',
    title: 'Astronomy',
    description: 'Sun, moon, twilight, sky darkness, aerosols, and observing windows.',
  },
  {
    id: 'data',
    title: 'Data & Units',
    description: 'Source coverage, units, freshness, confidence, and how to read app values.',
  },
];

const START_TOPIC_IDS = new Set([
  'activity-scores',
  'data-availability',
  'global-weather-sources',
  'alerts-watches-warnings',
]);

const COMFORT_TOPIC_IDS = new Set([
  'dewpoint',
  'humidity',
  'spread_temp_dew',
  'heat-index',
  'wind-chill',
  'apparent-temp',
]);

const CLOUD_TOPIC_IDS = new Set([
  'pop',
  'clouds',
  'shortwave-radiation',
  'radiation-regime',
  'uv',
  'fog',
  'fog_risk',
  'frost',
  'thunderstorm-risk',
  'snow-level',
]);

export function getLearnCategoryForTopic(topic: LearnTopic): LearnCategory {
  const id = topic.id;
  const explicit = LEARN_CATEGORIES.find((category) => category.id === topic.category);
  if (explicit) return explicit;

  if (START_TOPIC_IDS.has(id)) return LEARN_CATEGORIES[0];
  if (COMFORT_TOPIC_IDS.has(id)) return LEARN_CATEGORIES.find((category) => category.id === 'comfort') ?? LEARN_CATEGORIES[1];
  if (CLOUD_TOPIC_IDS.has(id)) return LEARN_CATEGORIES.find((category) => category.id === 'clouds') ?? LEARN_CATEGORIES[1];
  if (id.startsWith('radar-') || id === 'front-types' || id === 'satellite-layers' || id === 'radar-mosaic' || id === 'map-layer-performance') {
    return LEARN_CATEGORIES.find((category) => category.id === 'maps') ?? LEARN_CATEGORIES[1];
  }
  if (id.startsWith('marine-') || id.startsWith('wave-') || id === 'significant-wave-height' || id === 'beaufort-scale' || id === 'tallest-set' || id === 'air-sea-stability' || id === 'tide-predictions' || id === 'buoy-observations' || id === 'water-stations' || id === 'high-seas-forecasts') {
    return LEARN_CATEGORIES.find((category) => category.id === 'marine') ?? LEARN_CATEGORIES[1];
  }
  if (id.startsWith('aviation-') || id === 'sigmet-airmet') {
    return LEARN_CATEGORIES.find((category) => category.id === 'aviation') ?? LEARN_CATEGORIES[1];
  }
  if (id.startsWith('astro-') || id === 'mars-insight-weather') {
    return LEARN_CATEGORIES.find((category) => category.id === 'astro') ?? LEARN_CATEGORIES[1];
  }
  if (id.startsWith('solar-') || id.startsWith('swpc-') || id === 'noaa-scales' || id === 'kp' || id === 'imf-bz' || id === 'xray-flux' || id === 'proton-flux' || id === 'donki-events' || id === 'earth-disk' || id === 'earth-terminator' || id === 'cme-events') {
    return LEARN_CATEGORIES.find((category) => category.id === 'space') ?? LEARN_CATEGORIES[1];
  }
  if (id.includes('unit') || id.includes('source') || id.includes('availability') || id.includes('confidence')) {
    return LEARN_CATEGORIES.find((category) => category.id === 'data') ?? LEARN_CATEGORIES[1];
  }

  return LEARN_CATEGORIES.find((category) => category.id === 'land') ?? LEARN_CATEGORIES[0];
}

