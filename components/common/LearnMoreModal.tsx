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
  formula?: string;
  formulaLabel?: string;
  formulaNotes?: string[];
  insight?: string;
};

function asTopicArray(input: unknown): LearnTopic[] {
  if (!Array.isArray(input)) return [];
  return input as LearnTopic[];
}

type Mode = 'browse' | 'topic';

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
  const [mode, setMode] = useState<Mode>('browse');

  useEffect(() => {
    if (!visible) return;

    setQ('');

    if (initialTopicId) {
      setSelectedId(initialTopicId);
      setMode('topic');
    } else {
      setSelectedId(undefined);
      setMode('browse');
    }
  }, [visible, initialTopicId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return topics;

    return topics.filter((t) => {
      const hay = [
        t.title ?? '',
        t.summary ?? '',
        t.body ?? '',
        t.callout ?? '',
        t.insight ?? '',
        t.footer ?? '',
        t.formula ?? '',
        t.formulaLabel ?? '',
        ...(t.formulaNotes ?? []),
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

  const selected = useMemo(() => {
    if (!selectedId) return undefined;
    return topics.find((t) => t.id === selectedId);
  }, [topics, selectedId]);

  const onPick = (id: string) => {
    setSelectedId(id);
    setMode('topic');
  };

  const onBackToBrowse = () => {
    setMode('browse');
  };

  const topicCountLabel = `${filtered.length} topic${filtered.length === 1 ? '' : 's'}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {mode === 'topic' ? (
              <Pressable onPress={onBackToBrowse} style={styles.backBtn}>
                <Text style={styles.backText}>Browse Topics</Text>
              </Pressable>
            ) : (
              <View>
                <Text style={styles.eyebrow}>OMNI wxLearn</Text>
                <Text style={styles.title}>Understand the weather</Text>
              </View>
            )}
          </View>

          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        {mode === 'browse' ? (
          <>
            <View style={styles.searchWrap}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search topics…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.search}
              />
            </View>

            <View style={styles.browseMetaRow}>
              <Text style={styles.sectionLabel}>Browse topics</Text>
              <Text style={styles.topicCount}>{topicCountLabel}</Text>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {!!q.trim() && filtered.length > 0 ? (
                <Text style={styles.helperText}>Results for “{q.trim()}”</Text>
              ) : null}

              <View style={styles.topicList}>
                {filtered.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => onPick(t.id)}
                    style={styles.topicRow}
                  >
                    <View style={styles.topicRowTop}>
                      <Text style={styles.topicText} numberOfLines={2}>
                        {t.title}
                      </Text>
                      <Text style={styles.openHint}>Open</Text>
                    </View>

                    {t.summary ? (
                      <Text style={styles.topicSubtext} numberOfLines={3}>
                        {t.summary}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}

                {!filtered.length ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No matches found</Text>
                    <Text style={styles.emptyText}>
                      Try a simpler term like heat, wind, pressure, clouds, or humidity.
                    </Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </>
        ) : selected ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
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

              {selected.formula ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>{selected.formulaLabel ?? 'Formula'}</Text>
                  <View style={styles.formulaCard}>
                    <Text style={styles.formulaText}>{selected.formula}</Text>
                    {selected.formulaNotes?.length ? (
                      <View style={styles.formulaNotes}>
                        {selected.formulaNotes.map((note, idx) => (
                          <Text key={`${selected.id}-formula-note-${idx}`} style={styles.formulaNoteText}>
                            {note}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {!selected.formula && selected.formulaNotes?.length ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Units & Notes</Text>
                  <View style={styles.formulaCard}>
                    <View style={styles.formulaNotes}>
                      {selected.formulaNotes.map((note, idx) => (
                        <Text key={`${selected.id}-unit-note-${idx}`} style={styles.formulaNoteText}>
                          {note}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              {selected.insight ? (
                <View style={styles.insightCard}>
                  <Text style={styles.insightLabel}>Insight</Text>
                  <Text style={styles.insightText}>{selected.insight}</Text>
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
          </ScrollView>
        ) : null}
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

  headerLeft: {
    flex: 1,
    paddingRight: 10,
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

  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  backText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
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

  browseMetaRow: {
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
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    fontWeight: '800',
  },

  helperText: {
    marginBottom: 10,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 12,
    fontWeight: '700',
  },

  scrollContent: {
    paddingBottom: 26,
  },

  heroCard: {
    marginTop: 14,
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

  formulaCard: {
    marginTop: 2,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 14, 24, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(120, 190, 255, 0.22)',
  },

  formulaText: {
    color: 'rgba(150, 220, 255, 0.95)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '800',
  },
  formulaNotes: {
    marginTop: 12,
    gap: 4,
  },
  formulaNoteText: {
    color: 'rgba(226,232,240,0.74)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },

  insightCard: {
    marginTop: 16,
    padding: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 220, 120, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 220, 120, 0.22)',
  },

  insightLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  insightText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '700',
    lineHeight: 20,
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

  openHint: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 11,
    fontWeight: '900',
  },

  topicSubtext: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
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
