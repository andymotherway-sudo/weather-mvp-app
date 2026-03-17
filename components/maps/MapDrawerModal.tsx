// components/maps/MapDrawerModal.tsx
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { MAP_DESTINATIONS, type MapDestinationId } from '../../app/lib/maps/destinations';
import { Glass } from '../common/Glass';

export function MapDrawerModal(props: {
  visible: boolean;
  onClose: () => void;
  current: MapDestinationId;
  onSelect: (id: MapDestinationId) => void;
}) {
  const { visible, onClose, current, onSelect } = props;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-start',
        }}
      >
        <Pressable onPress={() => {}} style={{ paddingTop: 72, paddingHorizontal: 12 }}>
          <Glass style={{ borderRadius: 22, padding: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>Maps</Text>

              <Pressable
                onPress={onClose}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.14)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900' }}>Done</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12, gap: 10 }}>
              {MAP_DESTINATIONS.map((item) => {
                const active = item.id === current;
                const disabled = item.available === false;

                return (
                  <Pressable
                    key={item.id}
                    disabled={disabled}
                    onPress={() => {
                      if (disabled) return;
                      onSelect(item.id);
                      onClose();
                    }}
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)',
                      backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: 'white', fontWeight: '900', fontSize: 15 }}>{item.title}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 3 }}>
                          {item.subtitle}
                        </Text>
                      </View>

                      <View style={{ justifyContent: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.72)', fontWeight: '900' }}>
                          {disabled ? 'Soon' : active ? 'Current' : 'Open'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
}