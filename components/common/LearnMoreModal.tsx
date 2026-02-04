// components/common/LearnMoreModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LEARN_TOPICS } from '../../app/lib/learn/topics';

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
  const [showTopics, setShowTopics] = useState(true); // ✅ new

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setSelectedId(initialTopicId ?? LEARN_TOPICS[0]?.id);
    setShowTopics(true);
  }, [visible, initialTopicId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return LEARN_TOPICS;

    return LEARN_TOPICS.filter((t) => {
      const hay = [t.title ?? '', t.body ?? '', ...(t.bullets ?? []), t.id ?? ''].join(' ').toLowerCase();
      return hay.includes(query);
    });
  }, [q]);

  useEffect(() => {
    if (!visible) return;
    if (!filtered.length) return;
    const stillThere = filtered.some((t) => t.id === selectedId);
    if (!stillThere) setSelectedId(filtered[0].id);
  }, [visible, filtered, selectedId]);

  const selected = useMemo(() => {
    return LEARN_TOPICS.find((t) => t.id === selectedId) ?? filtered[0];
  }, [selectedId, filtered]);

  const onPick = (id: string) => {
    setSelectedId(id);
    setShowTopics(false); // ✅ auto-collapse after pick (friendlier)
  };

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
          onChangeText={(t) => {
            setQ(t);
            setShowTopics(true); // ✅ searching implies browsing topics
          }}
          placeholder="Search topics…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />

        {/* ✅ Single scroll, but “Selected” is first */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }}>
          {selected ? (
            <>
              <View style={styles.selectedHeaderRow}>
                <Text style={styles.section}>Selected</Text>

                <Pressable onPress={() => setShowTopics((v) => !v)} style={styles.toggleBtn}>
                  <Text style={styles.toggleText}>{showTopics ? 'Hide topics' : 'Show topics'}</Text>
                </Pressable>
              </View>

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

          {showTopics ? (
            <>
              <Text style={styles.section}>Topics</Text>
              <View style={styles.topicList}>
                {filtered.map((t) => {
                  const active = t.id === selected?.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => onPick(t.id)}
                      style={[styles.topicRow, active && styles.topicRowActive]}
                    >
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

  selectedHeaderRow: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  toggleText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 11 },

  section: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.85)' },

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
