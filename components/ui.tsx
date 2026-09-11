import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, shadow, space, type } from '@/lib/theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && !isDisabled && { opacity: 0.75 },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[type.bodyStrong, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={[type.smallStrong, { color: colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[s.input, props.style]}
      />
      {hint ? <Text style={[type.small, { color: colors.textFaint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ready' | 'almost' | 'primary';
}) {
  const palette = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    ready: { bg: colors.readySoft, fg: colors.ready },
    almost: { bg: colors.almostSoft, fg: colors.almost },
    primary: { bg: colors.primarySoft, fg: colors.primary },
  }[tone];

  return (
    <View style={[s.pill, { backgroundColor: palette.bg }]}>
      <Text style={[type.tiny, { color: palette.fg, textTransform: 'uppercase' }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={[type.tiny, { color: colors.textFaint, textTransform: 'uppercase' }]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

/**
 * Empty states carry a lot of weight in this app: a new household sees them
 * everywhere, and they are the only place to explain what to do next.
 */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.empty}>
      <Text style={[type.heading, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>{body}</Text>
      {action}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.loading}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={[type.small, { color: colors.textMuted }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={s.error}>
      <Text style={[type.small, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

export function Macros({
  calories,
  protein,
  carbs,
  fat,
  perServing = true,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  perServing?: boolean;
}) {
  const items = [
    { label: 'kcal', value: Math.round(calories) },
    { label: 'protein', value: `${Math.round(protein)}g` },
    { label: 'carbs', value: `${Math.round(carbs)}g` },
    { label: 'fat', value: `${Math.round(fat)}g` },
  ];
  return (
    <View style={{ gap: space.xs }}>
      <View style={s.macroRow}>
        {items.map((m) => (
          <View key={m.label} style={s.macroCell}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{m.value}</Text>
            <Text style={[type.tiny, { color: colors.textFaint }]}>{m.label}</Text>
          </View>
        ))}
      </View>
      {perServing ? (
        <Text style={[type.tiny, { color: colors.textFaint, textTransform: 'none' }]}>
          Per serving. Estimated from standard values, not lab tested.
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow.card,
  },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
  },
  loading: { alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xxl },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  macroRow: { flexDirection: 'row', gap: space.sm },
  macroCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: space.sm,
  },
});
