import React from 'react';
import * as RN from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Badge, Button, Card, Chip, Field, ListGroup, ListRow, Notice, ProgressBar, Text } from '@/components/kit';
import { ThemeProvider } from '@/theme';
import { darkPalette, lightPalette } from '@/theme/palette';

// The kit only needs useIsFocused (for the status bar); stub it rather than transform the navigation stack.
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

function render(ui: React.ReactElement, scheme: 'light' | 'dark') {
  jest.spyOn(RN, 'useColorScheme').mockReturnValue(scheme);
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return tree;
}

/** The flattened style of the host Text whose children contain `label`. */
function textStyle(tree: TestRenderer.ReactTestRenderer, label: string) {
  const node = tree.root.findAll((n: ReactTestInstance) => (n.type as string) === 'Text' && [n.props.children].flat().join('') === label)[0];
  return RN.StyleSheet.flatten(node!.props.style);
}

/** The host (native) view a component with this testID rendered: where style and accessibility land. */
function host(tree: TestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && n.props.testID === testID)[0]!;
}

/** The Pressable composite for a testID: where onPress lands (undefined while disabled). */
function pressable(tree: TestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.testID === testID && n.props.accessibilityRole === 'button',
  )[0]!;
}

afterEach(() => jest.restoreAllMocks());

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
] as const)('design system in %s', (scheme, palette) => {
  it('draws text in the theme colours', () => {
    const tree = render(
      <>
        <Text>primary text</Text>
        <Text tone="muted">muted text</Text>
        <Text tone="danger">danger text</Text>
      </>,
      scheme,
    );
    expect(textStyle(tree, 'primary text').color).toBe(palette.text);
    expect(textStyle(tree, 'muted text').color).toBe(palette.textMuted);
    expect(textStyle(tree, 'danger text').color).toBe(palette.dangerText);
  });

  it('renders a primary button with the accent, and a disabled one flat', () => {
    const press = jest.fn();
    const tree = render(
      <>
        <Button label="Save" onPress={press} testID="save" />
        <Button label="Off" disabled testID="off" />
      </>,
      scheme,
    );
    expect(RN.StyleSheet.flatten(host(tree, 'save').props.style).backgroundColor).toBe(palette.primary);
    expect(textStyle(tree, 'Save').color).toBe(palette.onPrimary);
    act(() => pressable(tree, 'save').props.onPress());
    expect(press).toHaveBeenCalledTimes(1);

    expect(host(tree, 'off').props.accessibilityState).toMatchObject({ disabled: true });
    expect(RN.StyleSheet.flatten(host(tree, 'off').props.style).backgroundColor).toBe(palette.surfaceMuted);
    // A disabled button has no press handler at all.
    expect(pressable(tree, 'off').props.onPress).toBeUndefined();
  });

  it('marks the selected chip and reports it to accessibility', () => {
    const tree = render(
      <>
        <Chip label="Lunch" selected onPress={() => {}} testID="lunch" />
        <Chip label="Dinner" onPress={() => {}} testID="dinner" />
      </>,
      scheme,
    );
    expect(host(tree, 'lunch').props.accessibilityState).toEqual({ selected: true });
    expect(host(tree, 'dinner').props.accessibilityState).toEqual({ selected: false });
    expect(RN.StyleSheet.flatten(host(tree, 'lunch').props.style).backgroundColor).toBe(palette.primarySoft);
    expect(RN.StyleSheet.flatten(host(tree, 'dinner').props.style).backgroundColor).toBe(palette.surface);
  });

  it('shows a field error in words and in the outline', () => {
    const tree = render(<Field label="Food" value="" onChangeText={() => {}} error="Enter what you ate" testID="food" />, scheme);
    expect(textStyle(tree, 'Enter what you ate').color).toBe(palette.dangerText);
    const outline = tree.root.findAll((n: ReactTestInstance) => RN.StyleSheet.flatten(n.props.style)?.borderColor === palette.danger);
    expect(outline.length).toBeGreaterThan(0);
  });

  it('renders the composite pieces without throwing', () => {
    expect(() =>
      render(
        <>
          <Card>
            <Text>inside</Text>
          </Card>
          <Badge label="Good" tone="success" />
          <Notice tone="warning" title="Heads up" action={{ label: 'Fix', onPress: () => {} }}>
            Something needs attention.
          </Notice>
          <ListGroup>
            <ListRow title="One" subtitle="first" onPress={() => {}} />
            <ListRow title="Two" value="2" />
          </ListGroup>
          <ProgressBar value={0.4} />
          <ProgressBar value={7} tone="danger" marker={0.5} />
          <ProgressBar value={Number.NaN} />
        </>,
        scheme,
      ),
    ).not.toThrow();
  });
});
