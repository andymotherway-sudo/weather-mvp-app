// components/common/LearnMoreModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LEARN_TOPICS } from '../../app/lib/learn/topics';

type LearnSection = {
  title?: string;
  body?: string;
  bullets?: string[];
};

type LearnReference = {
  label: string;
  value: string;
};

type LearnTopic = {
  id: string;
  title: string;
  body?: string;
  bullets?: string[];

  // richer optional fields
  summary?: string;
  sections?: LearnSection[];
  references?: LearnReference[];
  callout?: string;
  footer?: string;
};

function asTopicArray(input: unknown): LearnTopic[] {
  if (!Array.isArray(input)) return [];
  return input as LearnTopic[];
}

export function LearnMoreModal({
  visible,
  onClose,
  initialTopicId,
}: {
  visible: boolean;
  onClose: () => void;
  initialTopicId?: string;
}) {
  const topics = useMemo(() => asTopicArray(LEARN_TOPICS), []);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [showTopics, setShowTopics] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setSelectedId(initialTopicId ?? topics[0]?.id);
    setShowTopics(true);
  }, [visible, initialTopicId, topics]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return topics;

    return topics.filter((t) => {
      const hay = [
        t.title ?? '',
        t.summary ?? '',
        t.body ?? '',
        t.callout ?? '',
        t.footer ?? '',
        ...(t.bullets ?? []),
        ...(t.sections ?? []).flatMap((s) => [s.title ?? '', s.body ?? '', ...(s.bullets ?? [])]),
        ...(t.references ?? []).flatMap((r) => [r.label ?? '', r.value ?? '']),
        t.id ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return hay.includes(query);
    });
  }, [q, topics]);

  useEffect(() => {
    if (!visible) return;
    if (!filtered.length) return;
    const stillThere = filtered.some((t) => t.id === selectedId);
    if (!stillThere) setSelectedId(filtered[0].id);
  }, [visible, filtered, selectedId]);

  const selected = useMemo(() => {
    return topics.find((t) => t.id === selectedId) ?? filtered[0];
  }, [topics, selectedId, filtered]);

  const onPick = (id: string) => {
    setSelectedId(id);
    setShowTopics(false);
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
            setShowTopics(true);
          }}
          placeholder="Search topics…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {selected ? (
            <>
              <View style={styles.selectedHeaderRow}>
                <Text style={styles.sectionLabel}>Selected</Text>

                <Pressable onPress={() => setShowTopics((v) => !v)} style={styles.toggleBtn}>
                  <Text style={styles.toggleText}>{showTopics ? 'Hide topics' : 'Show topics'}</Text>
                </Pressable>
              </View>

              <View style={styles.contentCard}>
                <Text style={styles.contentTitle}>{selected.title}</Text>

                {selected.summary ? <Text style={styles.summary}>{selected.summary}</Text> : null}

                {selected.callout ? (
                  <View style={styles.calloutCard}>
                    <Text style={styles.calloutLabel}>Why it matters</Text>
                    <Text style={styles.calloutText}>{selected.callout}</Text>
                  </View>
                ) : null}

                {selected.references?.length ? (
                  <View style={styles.referenceWrap}>
                    {selected.references.map((ref, idx) => (
                      <View key={`${selected.id}-ref-${idx}`} style={styles.referenceChip}>
                        <Text style={styles.referenceLabel}>{ref.label}</Text>
                        <Text style={styles.referenceValue}>{ref.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.bullets?.length ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Quick takeaways</Text>
                    {selected.bullets.map((b, idx) => (
                      <View key={`${selected.id}-b-${idx}`} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.body ? (
                  <View style={styles.block}>
                    <Text style={styles.body}>{selected.body}</Text>
                  </View>
                ) : null}

                {selected.sections?.map((sec, idx) => (
                  <View key={`${selected.id}-sec-${idx}`} style={styles.sectionCard}>
                    {sec.title ? <Text style={styles.sectionTitle}>{sec.title}</Text> : null}
                    {sec.body ? <Text style={styles.sectionBody}>{sec.body}</Text> : null}

                    {sec.bullets?.length
                      ? sec.bullets.map((b, bulletIdx) => (
                          <View key={`${selected.id}-sec-${idx}-b-${bulletIdx}`} style={styles.bulletRow}>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.bulletText}>{b}</Text>
                          </View>
                        ))
                      : null}
                  </View>
                ))}

                {selected.footer ? <Text style={styles.footer}>{selected.footer}</Text> : null}
              </View>
            </>
          ) : null}

          {showTopics ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 14, marginBottom: 8 }]}>Topics</Text>

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
                      {t.summary ? (
                        <Text
                          style={[styles.topicSubtext, active && styles.topicSubtextActive]}
                          numberOfLines={2}
                        >
                          {t.summary}
                        </Text>
                      ) : null}
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
  },

  doneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  doneText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
  },

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

  toggleText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '900',
    fontSize: 11,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.85)',
  },

  topicList: {
    gap: 10,
  },

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

  topicText: {
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '900',
  },

  topicTextActive: {
    color: 'white',
  },

  topicSubtext: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.60)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },

  topicSubtextActive: {
    color: 'rgba(255,255,255,0.78)',
  },

  contentCard: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  contentTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
  },

  summary: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '700',
    lineHeight: 20,
  },

  calloutCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(120, 190, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(120, 190, 255, 0.18)',
  },

  calloutLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  calloutText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '700',
    lineHeight: 19,
  },

  referenceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },

  referenceChip: {
    minWidth: 110,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  referenceLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '800',
  },

  referenceValue: {
    marginTop: 3,
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
  },

  block: {
    marginTop: 14,
  },

  blockTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 6,
  },

  body: {
    color: 'rgba(255,255,255,0.74)',
    fontWeight: '700',
    lineHeight: 20,
  },

  sectionCard: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  sectionTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 14,
    marginBottom: 6,
  },

  sectionBody: {
    color: 'rgba(255,255,255,0.74)',
    fontWeight: '700',
    lineHeight: 20,
  },

  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'flex-start',
  },

  bulletDot: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '900',
    marginTop: 1,
  },

  bulletText: {
    flex: 1,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '700',
    lineHeight: 18,
  },

  footer: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
  },
});

export default LearnMoreModal;