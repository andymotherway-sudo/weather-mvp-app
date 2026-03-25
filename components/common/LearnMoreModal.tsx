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
    setShowTopics(!initialTopicId);
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

  const topicCountLabel = `${filtered.length} topic${filtered.length === 1 ? '' : 's'}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>OMNI wx Learn</Text>
            <Text style={styles.title}>Understand the weather</Text>
          </View>

          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
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
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {selected ? (
            <>
              <View style={styles.selectedHeaderRow}>
                <View style={styles.selectedMeta}>
                  <Text style={styles.sectionLabel}>Selected topic</Text>
                  <Text style={styles.topicCount}>{topicCountLabel}</Text>
                </View>

                <Pressable onPress={() => setShowTopics((v) => !v)} style={styles.toggleBtn}>
                  <Text style={styles.toggleText}>{showTopics ? 'Hide topics' : 'Browse topics'}</Text>
                </Pressable>
              </View>

              <View style={styles.heroCard}>
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
                        <View style={styles.bulletDotWrap}>
                          <Text style={styles.bulletDot}>•</Text>
                        </View>
                        <Text style={styles.bulletText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.body ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Details</Text>
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
                            <View style={styles.bulletDotWrap}>
                              <Text style={styles.bulletDot}>•</Text>
                            </View>
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
              <View style={styles.topicHeaderRow}>
                <Text style={styles.sectionLabel}>Browse topics</Text>
                <Text style={styles.topicCount}>{topicCountLabel}</Text>
              </View>

              <View style={styles.topicList}>
                {filtered.map((t) => {
                  const active = t.id === selected?.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => onPick(t.id)}
                      style={[styles.topicRow, active && styles.topicRowActive]}
                    >
                      <View style={styles.topicRowTop}>
                        <Text style={[styles.topicText, active && styles.topicTextActive]} numberOfLines={2}>
                          {t.title}
                        </Text>
                        {active ? <Text style={styles.activePill}>Open</Text> : null}
                      </View>

                      {t.summary ? (
                        <Text
                          style={[styles.topicSubtext, active && styles.topicSubtextActive]}
                          numberOfLines={3}
                        >
                          {t.summary}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}

                {!filtered.length ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No matches found</Text>
                    <Text style={styles.emptyText}>Try a different search term or browse the full topic list.</Text>
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
    backgroundColor: 'rgba(0,0,0,0.62)',
  },

  sheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 54,
    bottom: 22,
    borderRadius: 26,
    backgroundColor: 'rgba(14, 18, 30, 0.985)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },

  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 10,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  eyebrow: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },

  doneBtn: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  doneText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
  },

  searchWrap: {
    marginTop: 12,
    marginBottom: 2,
  },

  search: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: 'white',
    fontSize: 15,
  },

  scrollContent: {
    paddingBottom: 26,
  },

  selectedHeaderRow: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  topicHeaderRow: {
    marginTop: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.88)',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  topicCount: {
    marginLeft: 10,
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    fontWeight: '800',
  },

  toggleBtn: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  toggleText: {
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '900',
    fontSize: 11,
  },

  heroCard: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  contentTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 22,
    lineHeight: 28,
  },

  summary: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.90)',
    fontWeight: '700',
    lineHeight: 21,
    fontSize: 15,
  },

  calloutCard: {
    marginTop: 14,
    padding: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(120, 190, 255, 0.11)',
    borderWidth: 1,
    borderColor: 'rgba(120, 190, 255, 0.20)',
  },

  calloutLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  calloutText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.90)',
    fontWeight: '700',
    lineHeight: 20,
    fontSize: 14,
  },

  referenceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },

  referenceChip: {
    minWidth: 112,
    marginRight: 8,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  referenceLabel: {
    color: 'rgba(255,255,255,0.56)',
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
    marginTop: 16,
  },

  blockTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  body: {
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '700',
    lineHeight: 21,
    fontSize: 14,
  },

  sectionCard: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  sectionTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 15,
    marginBottom: 6,
  },

  sectionBody: {
    color: 'rgba(255,255,255,0.76)',
    fontWeight: '700',
    lineHeight: 21,
    fontSize: 14,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 9,
  },

  bulletDotWrap: {
    width: 16,
    alignItems: 'center',
    paddingTop: 1,
  },

  bulletDot: {
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '900',
  },

  bulletText: {
    flex: 1,
    color: 'rgba(255,255,255,0.80)',
    fontWeight: '700',
    lineHeight: 19,
    fontSize: 14,
  },

  footer: {
    marginTop: 18,
    color: 'rgba(255,255,255,0.54)',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },

  topicList: {},

  topicRow: {
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },

  topicRowActive: {
    backgroundColor: 'rgba(160, 220, 255, 0.10)',
    borderColor: 'rgba(160, 220, 255, 0.20)',
  },

  topicRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  topicText: {
    flex: 1,
    color: 'rgba(255,255,255,0.94)',
    fontWeight: '900',
    fontSize: 14,
    lineHeight: 19,
    marginRight: 10,
  },

  topicTextActive: {
    color: 'white',
  },

  activePill: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  topicSubtext: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },

  topicSubtextActive: {
    color: 'rgba(255,255,255,0.80)',
  },

  emptyCard: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  emptyTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 14,
  },

  emptyText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.64)',
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 12,
  },
});

export default LearnMoreModal;