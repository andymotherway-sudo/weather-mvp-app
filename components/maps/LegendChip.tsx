// components/maps/LegendChip.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Glass } from '../common/Glass';

export function LegendChip(props: {
  title: string;
  children: React.ReactNode;

  // optional: start open / close callback
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(!!props.defaultOpen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    props.onOpenChange?.(next);
  };

  const chipText = useMemo(() => (open ? `${props.title} ×` : props.title), [open, props.title]);

  return (
    <View style={{ alignItems: 'flex-start' }}>
      {/* The tiny chip */}
      <Pressable
        onPress={toggle}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          backgroundColor: 'rgba(2,6,23,0.72)',
        }}
      >
        <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{chipText}</Text>
      </Pressable>

      {/* The popover */}
      {open ? (
        <View style={{ marginTop: 10, width: 260 }}>
          <Glass style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18 }}>
            {props.children}
          </Glass>
        </View>
      ) : null}
    </View>
  );
}
