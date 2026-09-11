import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorNote } from '@/components/ui';
import { uploadAndParse } from '@/lib/receipts';
import { useHouseholdId, useSession } from '@/lib/session';
import { colors, radius, space, type } from '@/lib/theme';

export default function ScanScreen() {
  const router = useRouter();
  const householdId = useHouseholdId();
  const { userId } = useSession();

  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (source: 'camera' | 'library') => {
    setError(null);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        source === 'camera'
          ? 'Camera access is off. Turn it on in your device settings to photograph a receipt.'
          : 'Photo access is off. Turn it on in your device settings, or use the camera instead.',
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1, mediaTypes: ['images'] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ['images'] });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setPreview(uri);
    setBusy(true);

    try {
      const { scanId, parsed } = await uploadAndParse(householdId!, userId!, uri);
      router.replace({
        pathname: '/scan/review',
        params: { scanId, payload: JSON.stringify(parsed) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong reading that receipt.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {busy ? (
        <Card style={s.busy}>
          {preview ? <Image source={{ uri: preview }} style={s.preview} /> : null}
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.bodyStrong, { color: colors.text }]}>Reading the receipt</Text>
          <Text style={[type.small, { color: colors.textMuted, textAlign: 'center' }]}>
            This usually takes fifteen to thirty seconds. Working out what the abbreviations mean
            is the slow part.
          </Text>
        </Card>
      ) : (
        <>
          <View style={s.intro}>
            <Text style={[type.title, { color: colors.text }]}>
              Photograph your receipt
            </Text>
            <Text style={[type.body, { color: colors.textMuted }]}>
              Everything it finds goes to a review screen first. Nothing reaches your pantry until
              you say so.
            </Text>
          </View>

          <Card style={{ gap: space.md }}>
            <Tip icon="sunny-outline" text="Flatten the receipt and use good light." />
            <Tip icon="crop-outline" text="Fill the frame with just the receipt." />
            <Tip icon="albums-outline" text="Very long receipts photograph better in two goes." />
          </Card>

          {error ? <ErrorNote message={error} /> : null}

          <View style={{ gap: space.sm }}>
            <Button title="Take a photo" onPress={() => run('camera')} />
            <Button
              title="Choose an existing photo"
              variant="secondary"
              onPress={() => run('library')}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Tip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.tip}>
      <Ionicons name={icon} size={17} color={colors.textFaint} />
      <Text style={[type.small, { color: colors.textMuted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: space.lg, gap: space.lg },
  intro: { gap: space.xs },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  busy: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  preview: {
    width: 120,
    height: 160,
    borderRadius: radius.md,
    resizeMode: 'cover',
    backgroundColor: colors.surfaceAlt,
  },
});
