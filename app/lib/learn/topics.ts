// app/lib/learn/topics.ts
// Central Learn-more topic library (Land Wx + Space Wx)
//
// Notes:
// - IDs are stable deep-link keys (via learnTopicId from NerdyExplainModal).
// - Keep aliases when renaming IDs so older links don’t break.

export type LearnSection = {
  title?: string;
  body?: string;
  bullets?: string[];
};

export type LearnReference = {
  label: string;
  value: string;
};

export type LearnTopic = {
  id: string;
  title: string;

  // legacy/simple fields
  bullets?: string[];
  body?: string;

  // richer fields for expanded LearnMoreModal
  summary?: string;
  callout?: string;
  references?: LearnReference[];
  sections?: LearnSection[];
  footer?: string;
};

export const LEARN_TOPICS: LearnTopic[] = [
  // =========================
  // Land Wx
  // =========================

  {
    id: 'dewpoint',
    title: 'Dew Point (and why it matters more than humidity)',
    summary:
      'Dew point is one of the best “how sticky does it actually feel?” numbers in weather because it measures the amount of moisture in the air more directly than relative humidity.',
    callout:
      'A high dew point can make even a moderate day feel muggy. A low dew point can make a hot day feel more manageable.',
    references: [
      { label: 'Dry feel', value: '< 50°F' },
      { label: 'Comfortable', value: '50–59°F' },
      { label: 'Sticky', value: '60–69°F' },
      { label: 'Tropical feel', value: '70°F+' },
    ],
    bullets: [
      'Dew point is a direct measure of actual moisture in the air.',
      'Higher dew point usually feels stickier and heavier.',
      'When temperature gets close to dew point, fog, dew, or low clouds become more likely.',
    ],
    body:
      'Dew point is the temperature the air would need to cool to in order to become saturated. That makes it a much more stable moisture signal than relative humidity, which changes a lot during the day as temperatures rise and fall.',
    sections: [
      {
        title: 'Why people notice it',
        body:
          'High dew point reduces how efficiently sweat evaporates, so your body has a harder time cooling itself. That is why “humid heat” feels so different from dry heat.',
      },
      {
        title: 'Why forecasters care',
        bullets: [
          'It helps explain mugginess and overnight comfort.',
          'It helps diagnose fog, dew, and low-cloud risk.',
          'It gives a clearer sense of moisture than RH alone.',
        ],
      },
      {
        title: 'Overnight clue',
        body:
          'When temperature falls toward dew point overnight, the air is getting closer to saturation. If the spread becomes very small, fog or dew becomes much more likely, especially with light wind.',
      },
    ],
    footer:
      'Rule of thumb: if the dew point is rising, the air is usually becoming more humid in a way your body will actually feel.',
  },

  {
    id: 'humidity',
    title: 'Relative Humidity (RH)',
    summary:
      'Relative humidity tells you how close the air is to saturation at the current temperature, not how much moisture is in the air by itself.',
    callout:
      'RH often confuses people because it can change a lot even when the actual moisture barely changes.',
    references: [
      { label: 'Very dry', value: '< 25%' },
      { label: 'Comfortable', value: '30–50%' },
      { label: 'Humid feel', value: '60%+' },
      { label: 'Near saturation', value: '90%+' },
    ],
    bullets: [
      'RH is temperature-dependent.',
      'RH often rises at night as air cools, even if moisture stays the same.',
      'Dew point is usually the better “actual moisture” metric.',
    ],
    body:
      'Relative humidity is a “how full is the bucket right now?” number. Warm air can hold more water vapor than cool air, so RH changes as temperature changes.',
    sections: [
      {
        title: 'Why RH can be misleading',
        body:
          'A cool morning can show high RH and still not feel especially muggy. A hot afternoon can show lower RH and still feel more oppressive if the dew point is high enough.',
      },
      {
        title: 'Where RH is still useful',
        bullets: [
          'Comfort and skin dryness',
          'Evaporation and drying potential',
          'Fog and condensation risk',
          'Fire-weather context when very low',
        ],
      },
    ],
    footer:
      'Best pairing: use RH to understand saturation, and dew point to understand actual moisture.',
  },

  {
    id: 'spread',
    title: 'Thermal spread (Temp − Dew Point)',
    summary:
      'Thermal spread is a quick near-surface saturation check: temperature minus dew point.',
    callout:
      'A shrinking spread often means the air is getting closer to fog, dew, frost, or low cloud formation.',
    references: [
      { label: 'Very small spread', value: '0–3°F' },
      { label: 'Moderate spread', value: '4–10°F' },
      { label: 'Dryer air', value: '10°F+' },
    ],
    bullets: [
      'Small spread = near saturation.',
      'Tiny spread can support fog, dew, or frost.',
      'Large spread usually means drier air and bigger temperature swings.',
    ],
    body:
      'Because spread is so simple, it is one of the best fast diagnostic tools in weather. It tells you how much cooling is needed before condensation starts.',
    sections: [
      {
        title: 'What a small spread means',
        bullets: [
          'The air is close to saturation.',
          'Only a little more cooling may be needed for fog or dew.',
          'Stable overnight conditions can quickly push it over the edge.',
        ],
      },
      {
        title: 'What a large spread means',
        bullets: [
          'The air is relatively dry.',
          'Nighttime cooling often proceeds more efficiently.',
          'Day/night temperature swings can be larger.',
        ],
      },
    ],
    footer:
      'This is one of the simplest but most powerful “what might happen overnight?” signals.',
  },
  {
    id: 'thermal_spread',
    title: 'Thermal spread (Temp − Dew Point)',
    summary:
      'Thermal spread is a quick near-surface saturation check: temperature minus dew point.',
    callout:
      'A shrinking spread often means the air is getting closer to fog, dew, frost, or low cloud formation.',
    references: [
      { label: 'Very small spread', value: '0–3°F' },
      { label: 'Moderate spread', value: '4–10°F' },
      { label: 'Dryer air', value: '10°F+' },
    ],
    bullets: [
      'Small spread = near saturation.',
      'Tiny spread can support fog, dew, or frost.',
      'Large spread usually means drier air and bigger temperature swings.',
    ],
    body:
      'Because spread is so simple, it is one of the best fast diagnostic tools in weather. It tells you how much cooling is needed before condensation starts.',
    sections: [
      {
        title: 'What a small spread means',
        bullets: [
          'The air is close to saturation.',
          'Only a little more cooling may be needed for fog or dew.',
          'Stable overnight conditions can quickly push it over the edge.',
        ],
      },
      {
        title: 'What a large spread means',
        bullets: [
          'The air is relatively dry.',
          'Nighttime cooling often proceeds more efficiently.',
          'Day/night temperature swings can be larger.',
        ],
      },
    ],
    footer:
      'This is one of the simplest but most powerful “what might happen overnight?” signals.',
  },

  {
    id: 'heat-index',
    title: 'Heat Index',
    summary:
      'Heat Index estimates how hot it feels when humidity makes it harder for sweat to evaporate and cool the body.',
    callout:
      'It is not just “hotter than the thermometer.” It is “harder for your body to keep up.”',
    references: [
      { label: 'Caution', value: '80s–90s+' },
      { label: 'Extreme caution', value: '90s–100s+' },
      { label: 'Danger', value: '103°F+' },
      { label: 'Extreme danger', value: '125°F+' },
    ],
    bullets: [
      'Most relevant in warm to hot, humid weather.',
      'Humidity is what makes heat feel oppressive.',
      'High dew point often drives high heat index values.',
    ],
    body:
      'Heat Index is the “it feels worse than the air temperature says” number for hot, humid conditions.',
    sections: [
      {
        title: 'Why it happens',
        body:
          'Your body cools itself by evaporating sweat. Humid air slows that process, so heat stress rises faster than the raw temperature alone suggests.',
      },
      {
        title: 'Why it matters',
        bullets: [
          'It helps explain fatigue and heat stress.',
          'It better reflects real outdoor discomfort than air temperature alone.',
          'It becomes especially important in prolonged humid heat.',
        ],
      },
    ],
    footer:
      'A 90°F day can feel much worse when the air is already loaded with moisture.',
  },

  {
    id: 'wind-chill',
    title: 'Wind Chill',
    summary:
      'Wind Chill estimates how cold exposed skin feels when moving air increases heat loss.',
    callout:
      'Wind chill is about exposed skin and body heat loss, not about objects magically becoming colder than the air.',
    references: [
      { label: 'Mild impact', value: 'Below freezing + breeze' },
      { label: 'Bitter cold feel', value: 'Teens/single digits' },
      { label: 'Dangerous exposure', value: 'Below 0°F' },
    ],
    bullets: [
      'Most meaningful when the air is cold and wind is noticeable.',
      'The stronger the wind, the faster exposed skin loses heat.',
      'Calm cold and windy cold can feel very different.',
    ],
    body:
      'Wind Chill explains why a cold windy day can feel much harsher than the same temperature in calm conditions.',
    sections: [
      {
        title: 'What changes with wind',
        body:
          'Wind strips away the thin layer of relatively warmer air your body builds near the skin. That speeds up heat loss and makes conditions feel more severe.',
      },
      {
        title: 'Practical meaning',
        bullets: [
          'Faster numbness on exposed skin',
          'More discomfort during outdoor activity',
          'Greater cold stress than temperature alone suggests',
        ],
      },
    ],
    footer:
      'When you are checking winter conditions, do not stop at the air temperature—look at the wind too.',
  },

  {
    id: 'apparent-temp',
    title: 'Feels Like (Apparent Temperature)',
    summary:
      'Apparent temperature is the general-purpose “outside experience” number: how conditions may feel to a person, not just what the thermometer reads.',
    callout:
      'This is the convenience metric. It is useful fast, but it is less specific than Heat Index or Wind Chill.',
    bullets: [
      'Often blends wind, humidity, and sometimes radiation effects.',
      'Different providers may calculate it slightly differently.',
      'It is meant for comfort, not technical diagnosis.',
    ],
    body:
      'Apparent temperature gives you the broad answer to “what will this probably feel like outside?”',
    sections: [
      {
        title: 'Why it differs from air temperature',
        bullets: [
          'Wind can make cold feel sharper.',
          'Humidity can make heat feel heavier.',
          'Sun exposure and assumptions can change the estimate too.',
        ],
      },
      {
        title: 'Why it differs from provider to provider',
        body:
          'Different weather providers use different assumptions and formulas, so apparent temperature is helpful but not perfectly universal.',
      },
    ],
    footer:
      'For deeper understanding, check whether humidity or wind is the main reason the “feels like” number is different.',
  },

  {
    id: 'wind',
    title: 'Wind (speed, gusts, direction)',
    summary:
      'Wind is not just one number. Sustained wind tells you the background flow, gusts tell you the strongest bursts, and direction helps explain what the atmosphere is doing.',
    callout:
      'A forecast with moderate wind and strong gusts can feel far rougher than the main wind number suggests.',
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
      'Direction shifts can hint at fronts, outflows, storms, or terrain-driven flow changes.',
    ],
    body:
      'Wind affects comfort, evaporation, wildfire behavior, aviation, marine conditions, smoke transport, and how stable or chaotic the lower atmosphere feels.',
    sections: [
      {
        title: 'Wind vs gusts',
        body:
          'This is one of the biggest points of confusion for users. Wind speed usually means the sustained or average flow over a short time. Gusts are brief spikes above that average. Example: wind 15 mph, gusts 30 mph means it is generally blowing around 15, but stronger bursts can suddenly hit 30.',
      },
      {
        title: 'Why gusts matter so much',
        bullets: [
          'They are often what you feel first.',
          'They shake tree branches and push on vehicles.',
          'They can blow around loose items even when the sustained wind seems manageable.',
          'They make conditions feel more turbulent and less predictable.',
        ],
      },
      {
        title: 'Human reference guide',
        bullets: [
          '0–5 mph: barely noticeable',
          '6–15 mph: light breeze, comfortable for most people',
          '16–25 mph: breezy, hair moving, flags extended',
          '26–39 mph: windy, umbrellas struggle, loose items may blow around',
          '40–57 mph: very windy, driving gets harder, branches move hard',
          '58–73 mph: damaging wind possible',
          '74+ mph: hurricane-force wind',
        ],
      },
      {
        title: 'Beginner-friendly hat rule',
        bullets: [
          'Light breeze: hat optional',
          'Windy: hat questionable',
          'Very windy: hold onto it',
          'Hurricane-force: forget the hat and protect yourself',
        ],
      },
      {
        title: 'Why direction matters',
        body:
          'A direction change can be as meaningful as a speed change. It can hint that a front passed, a thunderstorm outflow arrived, sea-breeze circulation kicked in, or local terrain flow shifted.',
      },
    ],
    footer:
      'Quick tip: if gusts are strong enough to make you think about your hat, they are strong enough to matter.',
  },

  {
    id: 'gusts',
    title: 'Gusts (the bursts you actually feel)',
    summary:
      'Gusts are short bursts of stronger wind above the sustained speed, and they are often what make a day feel rough or disruptive.',
    callout:
      'A day can look modest on the main wind number and still feel surprisingly windy because of gusts.',
    references: [
      { label: 'Noticeable bursts', value: '20–30 mph' },
      { label: 'Annoying / disruptive', value: '30–40 mph' },
      { label: 'Travel impacts', value: '40–50+ mph' },
      { label: 'Dangerous wind', value: '58+ mph' },
    ],
    bullets: [
      'Gusts are not the same thing as sustained wind.',
      'They often matter more for driving, loose objects, and rough outdoor conditions.',
      'They can spike with daytime mixing, showers, terrain, or passing fronts.',
    ],
    body:
      'If sustained wind is the background music, gusts are the sudden drum hits. They are brief, but they are often the part people notice most.',
    sections: [
      {
        title: 'What causes gusts',
        bullets: [
          'Turbulent mixing in the lower atmosphere',
          'Faster air aloft getting mixed downward',
          'Thunderstorm outflow or shower-driven bursts',
          'Terrain and buildings channeling wind unevenly',
        ],
      },
      {
        title: 'Why they matter in daily life',
        bullets: [
          'Doors slam unexpectedly',
          'Umbrellas stop being useful',
          'Driving gets jumpy, especially in taller vehicles',
          'Boating and exposed ridges feel rougher',
        ],
      },
    ],
    footer:
      'When users say “it feels windier than the forecast,” gusts are often the reason.',
  },

  {
    id: 'wind-reference',
    title: 'Wind speed reference guide',
    summary:
      'Wind numbers are easier to understand when translated into what people actually experience outside.',
    callout:
      'A reference guide helps turn “28 mph gusts” into a human answer instead of a raw number.',
    references: [
      { label: 'Calm', value: '0–5 mph' },
      { label: 'Light breeze', value: '6–15 mph' },
      { label: 'Breezy', value: '16–25 mph' },
      { label: 'Windy', value: '26–39 mph' },
      { label: 'Very windy', value: '40–57 mph' },
      { label: 'Hurricane force', value: '74+ mph' },
    ],
    sections: [
      {
        title: 'How to think about the ranges',
        bullets: [
          '0–5 mph: barely noticeable',
          '6–15 mph: pleasant breeze for many people',
          '16–25 mph: definitely breezy',
          '26–39 mph: windy enough to change plans or comfort',
          '40–57 mph: very windy, travel and branches become a concern',
          '74+ mph: serious life-safety wind',
        ],
      },
      {
        title: 'Useful everyday anchors',
        bullets: [
          '20 mph: you notice it',
          '30 mph: umbrellas start losing',
          '40 mph: crosswinds matter',
          '50+ mph: loose objects and branches become a real issue',
        ],
      },
    ],
    footer:
      'This kind of translation is often more useful to users than the raw mph value alone.',
  },

  {
    id: 'wind-direction',
    title: 'Wind direction (where the air is coming from)',
    summary:
      'Wind direction tells you where the air is coming from, and those shifts can reveal major changes in the atmosphere.',
    callout:
      'A change in wind direction can tell a better weather story than a change in speed.',
    bullets: [
      'North wind means air is coming from the north, not blowing toward it.',
      'Direction shifts can signal fronts, outflows, local terrain flow, or sea-breeze changes.',
      'Wind direction helps explain why temperature and moisture change.',
    ],
    body:
      'Direction is often the hidden clue in a forecast. It gives context about air-mass source regions and transitions.',
    sections: [
      {
        title: 'Why direction matters',
        bullets: [
          'It can show a front has passed',
          'It can reveal thunderstorm outflow',
          'It can explain cooling or warming trends',
          'It can hint that smoke, marine air, or dry air is arriving',
        ],
      },
      {
        title: 'Common confusion',
        body:
          'A “west wind” means the air is coming from the west. Meteorologists name wind by its source direction, not its destination.',
      },
    ],
    footer:
      'If the wind changes direction and the air suddenly feels different, that is usually not your imagination.',
  },

  {
    id: 'gust-factor',
    title: 'Gust factor (Gust ÷ Wind)',
    summary:
      'Gust factor is a quick way to describe how jumpy, bursty, or turbulent the wind feels compared with the steady flow.',
    callout:
      'It helps distinguish “steady windy” from “annoyingly punchy.”',
    references: [
      { label: 'Steadier flow', value: 'Lower ratio' },
      { label: 'More turbulent', value: 'Higher ratio' },
    ],
    bullets: [
      'Higher gust factor often means rougher, less uniform wind.',
      'It can spike with showers, frontal passages, or daytime mixing.',
      'Near-calm sustained wind can make the ratio noisy.',
    ],
    body:
      'Gust factor is simple but useful. It puts the strongest burst in context of the background wind.',
    sections: [
      {
        title: 'How to use it',
        body:
          'A higher ratio means the wind is arriving in stronger surges rather than as a smooth steady flow. That often matters more for feel and impacts than the average wind alone.',
      },
      {
        title: 'Where it helps',
        bullets: [
          'Driving',
          'Boating',
          'Exposed ridges',
          'Forecast messaging about “gusty” conditions',
        ],
      },
    ],
    footer:
      'This is one of the best small metrics for describing whether the wind feels steady or chaotic.',
  },

  {
    id: 'pop',
    title: 'POP (Probability of Precipitation)',
    summary:
      'POP is the chance of measurable precipitation at your location during a forecast period.',
    callout:
      'It is a probability, not a measure of intensity, coverage percent on a map, or duration.',
    references: [
      { label: 'Low chance', value: '20% or less' },
      { label: 'Moderate chance', value: '30–50%' },
      { label: 'Good chance', value: '60–80%' },
      { label: 'Very likely', value: '90%+' },
    ],
    bullets: [
      'POP does not say how hard it will rain.',
      'POP does not say it will rain for that percent of the day.',
      'It is about the chance that measurable precip happens at your point.',
    ],
    body:
      'Probability of precipitation is one of the most misunderstood forecast numbers.',
    sections: [
      {
        title: 'What 40% POP actually means',
        body:
          'It means there is a 40% chance of measurable precipitation at your location during the forecast period. It does not mean it rains 40% of the time.',
      },
      {
        title: 'What POP does not tell you',
        bullets: [
          'How intense the rain will be',
          'How long it will last',
          'Whether it is widespread or isolated by itself',
        ],
      },
    ],
    footer:
      'To understand the full story, combine POP with radar, expected amounts, storm mode, and timing.',
  },

  {
    id: 'clouds',
    title: 'Cloud cover',
    summary:
      'Cloud cover changes much more than sky appearance — it strongly affects heating, cooling, light levels, and even how the whole day feels.',
    callout:
      'Clouds can act like a sunshade by day and a blanket by night.',
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
      'Cloud cover is one of the biggest controls on how the atmosphere feels from sunrise to bedtime.',
    sections: [
      {
        title: 'Daytime effect',
        body:
          'More cloud cover usually means less heating, slower temperature rise, and sometimes reduced instability.',
      },
      {
        title: 'Nighttime effect',
        body:
          'Clouds often reduce cooling overnight by limiting how efficiently heat escapes to space.',
      },
      {
        title: 'Why cloud type matters',
        bullets: [
          'Thin high clouds may still allow lots of light',
          'Low stratus can sharply reduce solar heating',
          'Cloud thickness changes the real-world effect',
        ],
      },
    ],
    footer:
      'Cloud cover is one of the best examples of a field that affects both comfort and forecast evolution.',
  },

  {
    id: 'shortwave-radiation',
    title: 'Shortwave radiation (sunlight reaching the surface)',
    summary:
      'Shortwave radiation is incoming solar energy reaching the ground, and it is a major engine for daytime heating and mixing.',
    callout:
      'This is one of the hidden drivers behind why afternoons often turn warmer, drier, and gustier.',
    references: [
      { label: 'High shortwave', value: 'More heating' },
      { label: 'Reduced shortwave', value: 'Cloud-muted day' },
    ],
    bullets: [
      'More shortwave usually means stronger surface heating.',
      'Clouds are one of the biggest controls on shortwave reaching the surface.',
      'Strong shortwave often helps deepen mixing through the day.',
    ],
    body:
      'Shortwave radiation is basically the sunlight energy available to heat the ground and lower atmosphere.',
    sections: [
      {
        title: 'Why it matters',
        bullets: [
          'Warms the surface',
          'Helps trigger vertical mixing',
          'Can lower relative humidity during the day',
          'Can contribute to stronger afternoon gusts',
        ],
      },
      {
        title: 'What weakens it',
        bullets: [
          'Cloud cover',
          'Low sun angle',
          'Thicker atmospheric filtering',
        ],
      },
    ],
    footer:
      'If you want to know why a sunny day feels different from a cloudy one beyond “more light,” shortwave radiation is a big part of the answer.',
  },
  {
    id: 'radiation',
    title: 'Shortwave radiation (sunlight reaching the surface)',
    summary:
      'Shortwave radiation is incoming solar energy reaching the ground, and it is a major engine for daytime heating and mixing.',
    callout:
      'This is one of the hidden drivers behind why afternoons often turn warmer, drier, and gustier.',
    references: [
      { label: 'High shortwave', value: 'More heating' },
      { label: 'Reduced shortwave', value: 'Cloud-muted day' },
    ],
    bullets: [
      'More shortwave usually means stronger surface heating.',
      'Clouds are one of the biggest controls on shortwave reaching the surface.',
      'Strong shortwave often helps deepen mixing through the day.',
    ],
    body:
      'Shortwave radiation is basically the sunlight energy available to heat the ground and lower atmosphere.',
    sections: [
      {
        title: 'Why it matters',
        bullets: [
          'Warms the surface',
          'Helps trigger vertical mixing',
          'Can lower relative humidity during the day',
          'Can contribute to stronger afternoon gusts',
        ],
      },
      {
        title: 'What weakens it',
        bullets: [
          'Cloud cover',
          'Low sun angle',
          'Thicker atmospheric filtering',
        ],
      },
    ],
    footer:
      'If you want to know why a sunny day feels different from a cloudy one beyond “more light,” shortwave radiation is a big part of the answer.',
  },

  {
    id: 'radiation-regime',
    title: 'Radiation Regime (net surface heating vs cooling)',
    summary:
      'Radiation regime describes whether the surface is gaining energy overall or losing it.',
    callout:
      'This helps explain why some periods favor fog and frost while others favor mixing and gustiness.',
    bullets: [
      'Sunlight adds energy by day.',
      'Infrared heat loss removes energy, especially at night.',
      'Clouds can reduce daytime heating but also reduce nighttime cooling.',
    ],
    body:
      'This is a more diagnostic topic than a single direct measurement, but it is extremely useful for explaining atmosphere behavior.',
    sections: [
      {
        title: 'Net warming regime',
        bullets: [
          'Surface gains more energy than it loses',
          'Supports warming and deeper daytime mixing',
          'Often helps explain gustier afternoons',
        ],
      },
      {
        title: 'Net cooling regime',
        bullets: [
          'Surface loses more energy than it gains',
          'Supports stability, fog, dew, and frost',
          'Often happens overnight under favorable conditions',
        ],
      },
    ],
    footer:
      'Radiation regime is a “why the forecast is behaving this way” concept, not just a number.',
  },

  {
    id: 'uv',
    title: 'UV Index',
    summary:
      'UV Index is a quick exposure-risk scale for ultraviolet radiation from the Sun.',
    callout:
      'UV is about skin and eye exposure risk, not about how hot the air feels.',
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
      'Clouds can reduce UV, but not always as much as people assume.',
    ],
    body:
      'UV Index helps translate invisible solar risk into a simple exposure number.',
    sections: [
      {
        title: 'Why it surprises people',
        body:
          'You can have high UV on a cool day, so people often underestimate it when the air temperature feels pleasant.',
      },
      {
        title: 'What can boost UV exposure',
        bullets: [
          'High sun angle',
          'Clearer skies',
          'Higher elevation',
          'Reflective surfaces like snow or water',
        ],
      },
    ],
    footer:
      'UV is one of the best reminders that “sunny” and “safe exposure” are not the same thing.',
  },

  {
    id: 'visibility',
    title: 'Visibility',
    summary:
      'Visibility is how far you can clearly see near the surface, and it is one of the most practical impact fields in weather.',
    callout:
      'A rapid drop in visibility often matters more to daily life than a technical weather label.',
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
      'Visibility is an impact-first metric. It tells you how clearly you can see through the air near the ground.',
    sections: [
      {
        title: 'What can reduce it',
        bullets: [
          'Fog and low cloud',
          'Smoke and haze',
          'Dust and blowing sand',
          'Heavy rain or snow',
        ],
      },
      {
        title: 'Why it matters',
        body:
          'Even “light” weather can become high-impact if visibility suddenly drops enough to change driving or travel conditions.',
      },
    ],
    footer:
      'Sometimes visibility tells the real story faster than the forecast headline does.',
  },

  {
    id: 'pressure',
    title: 'Pressure (sea-level pressure)',
    summary:
      'Pressure helps describe the broader weather setup — highs, lows, ridges, troughs, and the larger background regime.',
    callout:
      'The number matters, but the trend and the surrounding pattern often matter more.',
    bullets: [
      'Pressure is best used as context, not as a standalone forecast.',
      'Higher pressure often aligns with broader stability.',
      'Lower pressure often aligns with unsettled or more dynamic setups.',
    ],
    body:
      'Sea-level pressure is one of the classic large-scale weather anchors. It helps explain why local weather is behaving the way it is.',
    sections: [
      {
        title: 'What it helps diagnose',
        bullets: [
          'Highs and lows',
          'Ridges and troughs',
          'Broad stability vs. active weather',
          'Pressure gradients that influence wind',
        ],
      },
      {
        title: 'Why the raw number is not enough',
        body:
          'Pressure becomes far more meaningful when paired with trend, wind shifts, and surrounding pattern context.',
      },
    ],
    footer:
      'Pressure is part of the setup story. Pressure tendency is part of the change story.',
  },

  {
    id: 'pressure-tendency',
    title: 'Pressure tendency (the steering wheel of weather changes)',
    summary:
      'Pressure tendency focuses on how pressure is changing over time, which often says more about evolving weather than the raw number itself.',
    callout:
      'If pressure is moving quickly, the atmosphere is usually telling you something important.',
    references: [
      { label: 'Falling', value: 'System approaching' },
      { label: 'Rising', value: 'Often stabilizing' },
      { label: 'Rapid change', value: 'More meaningful signal' },
    ],
    bullets: [
      'Falling pressure often suggests an approaching low or front.',
      'Rising pressure often follows clearing or stabilization.',
      'The rate of change is often more informative than the absolute value.',
    ],
    body:
      'Pressure tendency is one of the best “what is changing?” signals in day-to-day weather.',
    sections: [
      {
        title: 'Falling pressure',
        bullets: [
          'Approaching disturbance',
          'Possible strengthening system',
          'Potential increase in weather change or forcing',
        ],
      },
      {
        title: 'Rising pressure',
        bullets: [
          'Air mass settling',
          'Post-frontal stabilization',
          'Clearing or less active conditions',
        ],
      },
    ],
    footer:
      'When paired with wind shifts and cloud trends, pressure tendency becomes much more powerful.',
  },

  {
    id: 'nws-alerts',
    title: 'NWS Alerts (what they mean)',
    summary:
      'NWS alerts are official hazard messages designed to communicate risk, timing, location, and action.',
    callout:
      'The short headline is helpful, but the full text is where the important details live.',
    bullets: [
      'Alerts are tied to areas and timing windows.',
      'They can be updated, expanded, replaced, or canceled as conditions evolve.',
      'Official protective action guidance always takes priority.',
    ],
    body:
      'Alerts are not just labels — they are operational safety messages.',
    sections: [
      {
        title: 'What the full text often tells you',
        bullets: [
          'What the hazard is',
          'When it matters',
          'Which areas are affected',
          'What actions are recommended',
        ],
      },
      {
        title: 'Why updates matter',
        body:
          'Fast-changing hazards like severe storms, flash floods, or wildfire can evolve quickly, so the newest alert text is often the most important version.',
      },
    ],
    footer:
      'OMNI wx can surface the alert, but official instructions should guide actual safety decisions.',
  },

  {
    id: 'data-availability',
    title: 'Why some fields are blank',
    summary:
      'Blank fields usually mean the upstream data source did not provide that value for that place or time.',
    callout:
      'We prefer missing to misleading when the data is not actually available.',
    bullets: [
      'Not every source includes every variable everywhere.',
      'We do not invent values when the source is missing.',
      'Coverage can improve later by adding fallback providers.',
    ],
    body:
      'A blank field is often a trust decision, not an error.',
    sections: [
      {
        title: 'Why this happens',
        bullets: [
          'Different providers expose different fields',
          'Some places have thinner data coverage',
          'Some forecast products omit certain variables',
        ],
      },
      {
        title: 'Why we do not just guess',
        body:
          'A made-up “filled” value can look polished but be more misleading than showing that the field is unavailable.',
      },
    ],
    footer:
      'Better to be honestly incomplete than falsely precise.',
  },

  {
    id: 'fog',
    title: 'Fog (when the air becomes cloud at ground level)',
    summary:
      'Fog is essentially a cloud that forms at the surface when air cools enough to reach saturation.',
    callout:
      'Fog is often less about dramatic weather and more about quiet setup: cooling, moisture, and light wind.',
    references: [
      { label: 'Higher risk clue', value: 'Tiny temp-dew spread' },
      { label: 'Classic setup', value: 'Night + light wind' },
    ],
    bullets: [
      'Fog becomes more likely when temperature gets very close to dew point.',
      'Light wind often helps fog form by allowing shallow cooling near the ground.',
      'Clear nights can support strong cooling, but clouds can sometimes complicate the setup.',
    ],
    body:
      'Fog is a boundary-layer story. The near-surface air cools, saturates, and condenses into tiny droplets suspended near the ground.',
    sections: [
      {
        title: 'Common ingredients',
        bullets: [
          'Moist air',
          'Nighttime cooling',
          'Small temperature-dew point spread',
          'Light or gentle wind',
        ],
      },
      {
        title: 'Why it matters',
        bullets: [
          'Rapid visibility drops',
          'Driving hazards',
          'Aviation impacts',
          'Can form surprisingly fast near sunrise',
        ],
      },
    ],
    footer:
      'Fog risk often rises quietly overnight before people notice it in the morning.',
  },

  {
    id: 'frost',
    title: 'Frost (surface cooling below freezing)',
    summary:
      'Frost forms when surfaces cool enough for water vapor to deposit as ice, often under calm, clear, efficient-cooling conditions.',
    callout:
      'Frost can happen even when the official air temperature is not dramatically below freezing.',
    bullets: [
      'Clear skies often help surfaces lose heat efficiently overnight.',
      'Light wind usually favors frost more than strong wind.',
      'Dry air and efficient radiational cooling can support colder surfaces than expected.',
    ],
    body:
      'Frost is a surface process, not just an air-temperature number. Ground, rooftops, and exposed objects can cool faster than the air a few feet above them.',
    sections: [
      {
        title: 'Classic frost setup',
        bullets: [
          'Clear sky',
          'Light wind',
          'Cold overnight temperatures',
          'Good radiational cooling',
        ],
      },
      {
        title: 'Why growers care',
        body:
          'Frost can damage tender plants even in situations that do not look dramatically cold at first glance.',
      },
    ],
    footer:
      'When temperatures are close and the setup is favorable, surfaces can be the first place the cold shows up.',
  },

  {
    id: 'air-pressure-gradient',
    title: 'Pressure gradient (why wind starts moving)',
    summary:
      'Pressure gradient is the change in pressure across distance, and it is one of the main reasons air starts moving from place to place.',
    callout:
      'Wind is not just about pressure. It is about pressure differences.',
    bullets: [
      'A tighter pressure gradient usually supports stronger wind.',
      'A weaker gradient usually supports lighter wind.',
      'This is one reason storms and nearby highs/lows can change wind dramatically.',
    ],
    body:
      'Pressure gradient is the push behind the wind. The atmosphere responds to differences in pressure, not just the pressure value at one point.',
    sections: [
      {
        title: 'Why it matters',
        bullets: [
          'Explains broad windy setups',
          'Helps connect synoptic pattern to local wind',
          'Adds context for why conditions become breezy or stronger',
        ],
      },
      {
        title: 'Simple idea',
        body:
          'When pressure changes a lot over a short distance, the atmosphere has a stronger reason to move air. That usually means stronger wind potential.',
      },
    ],
    footer:
      'This is one of the most useful hidden concepts behind everyday wind forecasts.',
  },

  // =========================
  // Space Wx (Solar tab)
  // =========================

  {
    id: 'noaa-scales',
    title: 'NOAA Space Weather Scales (G / R / S)',
    summary:
      'NOAA’s G, R, and S scales summarize the practical impacts of space weather instead of just raw measurements.',
    callout:
      'These are “what it does” scales, not “what the sensor reads” scales.',
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
      'These scales turn complicated space physics into operational impact language.',
    sections: [
      {
        title: 'G-scale',
        body:
          'Geomagnetic storm impacts: aurora expansion, some grid concerns, satellite drag, and magnetosphere-related effects.',
      },
      {
        title: 'R-scale',
        body:
          'Radio blackout impacts: mostly tied to flare X-rays disturbing the ionosphere and affecting HF communications.',
      },
      {
        title: 'S-scale',
        body:
          'Solar radiation impacts: energetic particles affecting aviation, astronauts, and satellites.',
      },
    ],
    footer:
      'Higher numbers generally mean broader or stronger impacts, but each scale describes a different kind of space-weather effect.',
  },

  {
    id: 'solar-wind',
    title: 'Solar Wind at L1 (speed, density, temperature)',
    summary:
      'L1 solar wind data is an upstream look at plasma conditions before they fully reach Earth.',
    callout:
      'Think of L1 as a short-range checkpoint between the Sun and Earth.',
    references: [
      { label: 'Speed', value: 'How fast it is arriving' },
      { label: 'Density', value: 'How packed it is' },
      { label: 'Temperature', value: 'Plasma character' },
    ],
    bullets: [
      'Speed influences how much energy may be available.',
      'Density affects dynamic pressure and magnetosphere compression.',
      'Bz often determines how efficiently that energy couples.',
    ],
    body:
      'Solar wind is the flowing stream of charged particles coming from the Sun. L1 observations give a heads-up before those conditions fully interact with Earth.',
    sections: [
      {
        title: 'Why speed matters',
        body:
          'Faster wind often raises the ceiling for geomagnetic activity, especially when other conditions line up.',
      },
      {
        title: 'Why density matters',
        body:
          'Higher density can increase dynamic pressure and compress Earth’s magnetic field more strongly.',
      },
      {
        title: 'What still decides the outcome',
        body:
          'The solar wind can bring energy, but magnetic orientation — especially Bz — often decides how much of that energy actually couples into Earth’s system.',
      },
    ],
    footer:
      'Strong solar wind is important, but strong solar wind with favorable magnetic coupling is when things often get more interesting.',
  },

  {
    id: 'imf-bz',
    title: 'IMF Bz (southward turning = better aurora coupling)',
    summary:
      'Bz is the north-south component of the interplanetary magnetic field, and it is one of the biggest short-term aurora switches.',
    callout:
      'Fast solar wind helps, but negative Bz often determines whether the magnetosphere really lights up.',
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
      'The magnetic field carried by the solar wind is not just background detail — its orientation changes how Earth responds.',
    sections: [
      {
        title: 'Why southward matters',
        body:
          'When Bz turns southward, it can connect more efficiently with Earth’s field and allow more energy to enter the magnetosphere.',
      },
      {
        title: 'Why observers watch it closely',
        body:
          'A fast solar wind stream with sustained negative Bz is one of the classic setups for elevated aurora potential.',
      },
    ],
    footer:
      'For short-term aurora watching, Bz often matters more than people expect.',
  },

  {
    id: 'kp',
    title: 'Kp Index (global geomagnetic activity)',
    summary:
      'Kp is a 0–9 global index describing how disturbed Earth’s magnetic field is over time.',
    callout:
      'Kp is useful, but it is not the whole aurora story.',
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
      'Kp is popular because it compresses a very complicated global magnetic response into a simple number.',
    sections: [
      {
        title: 'What it tells you well',
        bullets: [
          'How disturbed the geomagnetic field is overall',
          'Whether conditions are quiet, active, or storm-level',
          'Whether aurora may be reaching farther south than usual',
        ],
      },
      {
        title: 'What it does not tell you by itself',
        bullets: [
          'Whether your sky is clear',
          'Whether it is dark enough',
          'Whether local light pollution ruins the view',
        ],
      },
    ],
    footer:
      'A high Kp under cloudy skies is still a poor aurora night for most people.',
  },

  {
    id: 'xray-flux',
    title: 'GOES X-ray Flux and Flare Class',
    summary:
      'GOES X-ray flux shows how bright the Sun is in X-rays, and sudden spikes usually mark solar flares.',
    callout:
      'This is one of the clearest real-time views into sudden solar activity.',
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
      'GOES X-ray measurements are a cornerstone of real-time flare detection and radio blackout awareness.',
    sections: [
      {
        title: 'Why flare class matters',
        body:
          'Each class step is much stronger than the one below it, so an X-class flare is not just “a bit stronger” than an M-class flare.',
      },
      {
        title: 'Why it matters operationally',
        body:
          'Strong X-ray bursts can disturb the ionosphere quickly and contribute to radio blackout impacts.',
      },
    ],
    footer:
      'X-ray flux tells you the Sun is flaring now. Other data helps tell you what Earth impacts may follow.',
  },

  {
    id: 'proton-flux',
    title: 'Proton Flux (radiation / S-scale)',
    summary:
      'Proton flux tracks energetic particles near Earth and helps identify solar radiation storm conditions.',
    callout:
      'This matters much more to aviation, satellites, and astronauts than to most people on the ground.',
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
      'Energetic proton events are one of the key ways solar activity translates into radiation-focused operational concern.',
    sections: [
      {
        title: 'Who cares most',
        bullets: [
          'Polar aviation operations',
          'Satellite operators',
          'Astronauts and space missions',
        ],
      },
      {
        title: 'Why the public still may care',
        body:
          'Even if proton events do not affect daily ground life directly for most people, they are a major part of the broader space-weather risk environment.',
      },
    ],
    footer:
      'This is a great example of a field that is highly important even when it is mostly invisible to everyday life on the ground.',
  },

  {
    id: 'donki-events',
    title: 'NASA DONKI Events (flares, CMEs, particle storms)',
    summary:
      'DONKI is NASA’s event catalog for notable space-weather activity and gives narrative context beyond raw charts.',
    callout:
      'This helps answer “what happened?” rather than just “what is the sensor doing?”',
    bullets: [
      'DONKI catalogs notable flares, CMEs, shocks, and particle events.',
      'It helps connect measurements to actual space-weather events.',
      'CMEs often matter most for delayed geomagnetic storm risk.',
    ],
    body:
      'Raw measurements are useful, but event context is what makes the whole story make sense.',
    sections: [
      {
        title: 'Why CMEs matter so much',
        body:
          'Coronal mass ejections can take roughly 1–3 days to reach Earth, so they often create a delayed “cause now, impact later” rhythm in space weather.',
      },
      {
        title: 'Why event catalogs help',
        body:
          'They turn spikes, dips, and transitions into understandable solar events instead of isolated lines on a chart.',
      },
    ],
    footer:
      'For users who want the “why behind the numbers,” event context is often the missing piece.',
  },
];