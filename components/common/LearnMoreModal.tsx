// components/common/LearnMoreModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type LearnTopic = {
  id: string;
  title: string;
  bullets?: string[];
  body?: string;
};

const TOPICS: LearnTopic[] = [
  {
    id: 'dewpoint',
    title: "Dew Point (and why it's different than humidity)",
    bullets: [
      'Dew point is a direct measure of moisture in the air.',
      'Higher dew point feels “stickier,” even if temps are moderate.',
      'When temp approaches dew point, fog/dew becomes likely.',
    ],
    body:
      'Relative humidity depends on temperature. Dew point does not. Dew point is the temperature air must cool to in order to become saturated. When the spread between temperature and dew point shrinks (often < 3°F), the air is close to saturation and fog/dew becomes more likely—especially overnight with light winds.',
  },
  {
    id: 'humidity',
    title: 'Relative Humidity (RH)',
    bullets: [
      'RH is “how close to saturated” the air is at the current temperature.',
      'RH can rise at night even if moisture stays the same (because temp falls).',
      'Use dew point for a more stable moisture signal.',
    ],
    body:
      'Relative humidity is relative to temperature. Two air masses with the same dew point can have very different RH if their temperatures differ.',
  },
  {
    id: 'spread',
    title: 'Thermal spread (Temp − Dew Point)',
    bullets: [
      'A fast proxy for dryness and mixing potential.',
      'Small spread supports fog/low cloud; large spread implies drier air.',
      'Useful for “how close to saturation” at a glance.',
    ],
    body:
      'The spread is simply temperature minus dew point. It’s not a full stability metric, but it’s a great “at a glance” signal for moisture vs. heat.',
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
      'Heat Index combines temperature and humidity to estimate perceived heat when evaporation (sweat) is less effective.',
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
      'Wind Chill is a “feels like” estimate for cold conditions. Stronger winds remove heat from skin faster.',
  },
  {
    id: 'apparent-temp',
    title: 'Feels Like (Apparent Temperature)',
    bullets: [
      'A provider’s “overall feels like” estimate.',
      'Often blends wind + humidity + radiation effects.',
      'Can differ slightly from Heat Index / Wind Chill formulas.',
    ],
    body:
      'Some sources provide an “apparent temperature” that incorporates multiple effects. When we compute Heat Index or Wind Chill, we’ll label those explicitly.',
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
      'Gust factor is gust speed divided by sustained wind speed. Large values can indicate gustiness beyond typical steady flow.',
  },
  {
    id: 'pop',
    title: 'POP (Probability of Precip)',
    bullets: [
      'Chance of measurable precip at a point.',
      'Not the same as intensity or duration.',
      'Different providers may use slightly different thresholds.',
    ],
    body:
      'POP is a probability. A 40% POP does not mean it will rain 40% of the time; it means there’s a 40% chance of measurable precip at your point during the period.',
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
      'Cloud cover impacts surface temperature swings, solar heating, and nighttime cooling (“blanket effect”).',
  },
  {
    id: 'shortwave-radiation',
    title: 'Shortwave radiation (why clouds matter more than you think)',
    bullets: [
      'Shortwave ≈ sunlight reaching the surface.',
      'Clouds reduce shortwave → weaker daytime heating.',
      'Clear nights cool faster (bigger cold dips).',
    ],
    body:
      'Shortwave radiation is incoming solar energy. High shortwave with dry air often boosts mixing, which can lower humidity and increase wind gusts during the afternoon.',
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
      'UV Index is a convenient exposure-risk number. Use it for timing protection outdoors.',
  },
  {
    id: 'visibility',
    title: 'Visibility',
    bullets: [
      'How far you can see near the surface.',
      'Drops in fog, smoke, haze, and heavy precipitation.',
      'Useful for driving/aviation impacts.',
    ],
    body:
      'Visibility is an “impact” metric. Rapid drops can signal fog formation or smoke/haze intrusions.',
  },
  {
    id: 'pressure-tendency',
    title: 'Pressure tendency (the “steering wheel” of weather changes)',
    bullets: [
      'Falling pressure often precedes strengthening systems / approaching fronts.',
      'Rising pressure often follows clearing / stabilizing conditions.',
      'Rate of change matters more than absolute pressure.',
    ],
    body:
      'Pressure tendency helps diagnose synoptic evolution and fronts. Combine pressure tendency with wind shifts and cloud trends to anticipate changes.',
  },
  {
    id: 'pressure',
    title: 'Pressure (sea-level pressure)',
    bullets: [
      'Absolute pressure helps identify highs/lows and broad regimes.',
      'Compare to recent trend; the trend often matters more than the number.',
    ],
    body:
      'Surface/sea-level pressure provides context for whether you’re under a ridge (higher pressure) or trough (lower pressure).',
  },
  {
    id: 'data-availability',
    title: 'Why some fields are blank',
    bullets: [
      'Some sources do not include every observed variable for every place/time.',
      'We don’t invent values when the source is missing data.',
      'Later we can add fallback providers for richer coverage.',
    ],
    body:
      'If pressure/UV/visibility are missing, we treat them as unavailable. That avoids misleading “guesses.”',
  },
];

export function LearnMoreModal({
  visible,
  onClose,
  initialTopicId,
}: {
  visible: boolean;
  onClose: () => void;
  initialTopicId?: string;
}) {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setSelectedId(initialTopicId ?? TOPICS[0]?.id);
  }, [visible, initialTopicId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return TOPICS;

    return TOPICS.filter((t) => {
      const hay = [
        t.title ?? '',
        t.body ?? '',
        ...(t.bullets ?? []),
        t.id ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(query);
    });
  }, [q]);

  // Ensure selected stays valid under filtering
  useEffect(() => {
    if (!visible) return;
    if (!filtered.length) return;
    const stillThere = filtered.some((t) => t.id === selectedId);
    if (!stillThere) setSelectedId(filtered[0].id);
  }, [visible, filtered, selectedId]);

  const selected = useMemo(() => {
    return TOPICS.find((t) => t.id === selectedId) ?? filtered[0];
  }, [selectedId, filtered]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Learn</Text>
          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search topics…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }}>
          <Text style={styles.section}>Topics</Text>
          <View style={styles.topicList}>
            {filtered.map((t) => {
              const active = t.id === selected?.id;
              return (
                <Pressable key={t.id} onPress={() => setSelectedId(t.id)} style={[styles.topicRow, active && styles.topicRowActive]}>
                  <Text style={[styles.topicText, active && styles.topicTextActive]} numberOfLines={2}>
                    {t.title}
                  </Text>
                </Pressable>
              );
            })}
            {!filtered.length ? (
              <View style={[styles.topicRow, { opacity: 0.7 }]}>
                <Text style={styles.topicText}>No matches. Try a different search.</Text>
              </View>
            ) : null}
          </View>

          {selected ? (
            <>
              <Text style={styles.section}>Selected</Text>
              <View style={styles.contentCard}>
                <Text style={styles.contentTitle}>{selected.title}</Text>

                {selected.bullets?.length ? (
                  <View style={{ marginTop: 10 }}>
                    {selected.bullets.map((b, idx) => (
                      <View key={`${selected.id}-b-${idx}`} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.body ? <Text style={styles.body}>{selected.body}</Text> : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 70,
    bottom: 40,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 22, 35, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 14,
  },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: 'white', fontSize: 16, fontWeight: '900' },
  doneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  doneText: { color: 'white', fontWeight: '900', fontSize: 12 },

  search: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: 'white',
  },

  section: { marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.85)' },

  topicList: { gap: 10 },
  topicRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  topicRowActive: {
    backgroundColor: 'rgba(160, 220, 255, 0.10)',
    borderColor: 'rgba(160, 220, 255, 0.18)',
  },
  topicText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900' },
  topicTextActive: { color: 'white' },

  contentCard: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contentTitle: { color: 'white', fontWeight: '900', fontSize: 16 },
  body: { marginTop: 10, color: 'rgba(255,255,255,0.70)', fontWeight: '700', lineHeight: 19 },

  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' },
  bulletDot: { color: 'rgba(255,255,255,0.75)', fontWeight: '900', marginTop: 1 },
  bulletText: { flex: 1, color: 'rgba(255,255,255,0.75)', fontWeight: '700', lineHeight: 18 },
});

export default LearnMoreModal;
