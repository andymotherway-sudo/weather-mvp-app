// components/TabBarIcon.tsx
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';

type Props = {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  size?: number;
};

export default function TabBarIcon({ name, color, size = 24 }: Props) {
  const theme = useTheme();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? theme.colors.text}
    />
  );
}
