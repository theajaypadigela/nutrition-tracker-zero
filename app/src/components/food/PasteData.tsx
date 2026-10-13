import React, { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Check, ClipboardPaste, Copy, Sparkles } from 'lucide-react-native';
import { Button, Card, Icon, Notice, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, fontFor, radius, space, useTheme } from '@/theme';
import { dataIssueText, type DataIssue } from '@/utils/foodData';

/** How many problems are listed before "and more": enough to fix in one go, not a wall of text. */
const SHOWN_ISSUES = 5;

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const useStyles = createStyles(({ colors }) => ({
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  tile: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  heading: { flex: 1, gap: 2 },
  box: {
    minHeight: 160,
    maxHeight: 280,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 14,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
    ...fontFor('regular'),
    fontFamily: MONO,
  },
  prompt: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: MONO,
  },
}));

/**
 * The paste half of the food form, in two steps: copy the prompt and take it to a chat assistant, then paste the answer back. A
 * reply that cannot be read says what is wrong, in a list, and the text stays where it is so it can be fixed or asked for again.
 * Nothing here knows the format: it is handed the prompt, and hands back what was pasted.
 */
export function PasteData({
  prompt,
  text,
  onText,
  issues,
  copied,
  copyFailed,
  clipboardEmpty,
  onCopy,
  onPasteClipboard,
  onFill,
  onClear,
}: {
  prompt: string;
  text: string;
  onText: (text: string) => void;
  /** What could not be read in `text`, or null (nothing tried yet, or it read). */
  issues: DataIssue[] | null;
  copied: boolean;
  copyFailed: boolean;
  clipboardEmpty: boolean;
  onCopy: () => void;
  onPasteClipboard: () => void;
  onFill: () => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const t = strings.foodEntry.paste;
  const [focused, setFocused] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const listed = (issues ?? []).slice(0, SHOWN_ISSUES);
  const more = (issues?.length ?? 0) - listed.length;

  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <View style={{ gap: space.lg }}>
          <View style={styles.step}>
            <View style={styles.tile}>
              <Icon as={Sparkles} size="md" tone="primary" />
            </View>
            <View style={styles.heading}>
              <Text variant="bodyStrong">{t.copyTitle}</Text>
              <Text variant="small" tone="secondary">
                {t.copyBody}
              </Text>
            </View>
          </View>
          <Button
            testID="copy-prompt"
            label={copied ? t.copied : t.copy}
            icon={copied ? Check : Copy}
            variant={copied ? 'secondary' : 'soft'}
            fullWidth
            onPress={onCopy}
          />
          {copyFailed ? <Notice tone="warning">{t.copyError}</Notice> : null}
          <Pressable
            testID="toggle-prompt"
            accessibilityRole="button"
            onPress={() => setShowPrompt(!showPrompt)}
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <Text variant="smallStrong" tone="primary">
              {showPrompt ? t.hidePrompt : t.showPrompt}
            </Text>
          </Pressable>
          {showPrompt ? (
            <Text testID="prompt-text" selectable style={styles.prompt} maxFontSizeMultiplier={1.3}>
              {prompt}
            </Text>
          ) : null}
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.lg }}>
          <View style={styles.step}>
            <View style={styles.tile}>
              <Icon as={ClipboardPaste} size="md" tone="primary" />
            </View>
            <View style={styles.heading}>
              <Text variant="bodyStrong">{t.pasteTitle}</Text>
              <Text variant="small" tone="secondary">
                {t.pasteBody}
              </Text>
            </View>
          </View>
          <TextInput
            testID="paste-box"
            value={text}
            onChangeText={onText}
            placeholder={t.placeholder}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={t.pasteTitle}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
              styles.box,
              {
                borderColor: issues ? colors.danger : focused ? colors.primary : colors.inputBorder,
                borderWidth: focused || issues ? 2 : 1,
                padding: focused || issues ? 13 : 14,
              },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button testID="paste-clipboard" label={t.fromClipboard} icon={ClipboardPaste} variant="secondary" size="sm" style={{ flex: 1 }} onPress={onPasteClipboard} />
            {text ? <Button testID="paste-clear" label={t.clear} variant="ghost" size="sm" onPress={onClear} /> : null}
          </View>
          {clipboardEmpty ? (
            <Text variant="small" tone="muted">
              {t.noClipboard}
            </Text>
          ) : null}
          {issues ? (
            <Notice tone="danger" title={t.problems} testID="paste-problems">
              {[...listed.map(issue => `• ${dataIssueText(issue)}`), ...(more > 0 ? [fill(t.problemsMore, { n: more })] : []), t.problemsHint].join('\n')}
            </Notice>
          ) : null}
          <Button testID="fill-form" label={t.fill} fullWidth disabled={!text.trim()} onPress={onFill} />
        </View>
      </Card>
    </View>
  );
}
