// components/common/NerdyExplainModal.tsx
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type ExplainPayload = {
  title: string;
  summary?: string;
  whyItMatters?: string;
  howComputed?: string;
  confidence?: 'high' | 'medium' | 'low';
  learnTopicId?: string; // links into LearnMore modal topics
};

export function NerdyExplainModal({
  visible,
  onClose,
  payload,
  onLearnMore,
}: {
  visible: boolean;
  onClose: () => void;
  payload: ExplainPayload | null;
  onLearnMore?: (topicId: string) => void;
}) {
  if (!payload) return null;

  const hasOnlySummary =
    !!payload.summary &&
    !payload.whyItMatters &&
    !payload.howComputed &&
    !payload.confidence &&
    !payload.learnTopicId;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{payload.title}</Text>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
          {hasOnlySummary ? (
            <Text style={styles.alertText}>
              {payload.summary}
            </Text>
          ) : (
            <>
              {!!payload.confidence && (
                <Text style={styles.conf}>
                  {payload.confidence === 'high'
                    ? 'High confidence'
                    : payload.confidence === 'low'
                      ? 'Low confidence'
                      : 'Medium confidence'}
                </Text>
              )}

              {!!payload.summary && <Section label="What it means" text={payload.summary} />}

              {!!payload.whyItMatters && <Section label="Why it matters" text={payload.whyItMatters} />}

              {!!payload.howComputed && <Section label="How it’s computed" text={payload.howComputed} />}

              {!!payload.learnTopicId && !!onLearnMore && (
                <Pressable onPress={() => onLearnMore(payload.learnTopicId!)} style={styles.learnBtn}>
                  <Text style={styles.learnBtnText}>Learn more</Text>
                </Pressable>
              )}
            </>
          )}

          <View style={{ height: 12 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.60)' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 90,
    bottom: 60,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 22, 35, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 14,
  },
  header: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  title: { color: 'white', fontSize: 16, fontWeight: '900', flex: 1 },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  closeText: { color: 'white', fontWeight: '900', fontSize: 12 },

  conf: { marginTop: 8, color: 'rgba(255,255,255,0.60)', fontSize: 12, fontWeight: '800' },

  sectionLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '900', marginBottom: 6 },
  sectionText: { color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 18 },

  alertText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    paddingTop: 2,
  },

  learnBtn: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  learnBtnText: { color: 'white', fontWeight: '900' },
});