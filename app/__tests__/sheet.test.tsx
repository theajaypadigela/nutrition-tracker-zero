/**
 * The bottom sheet's two additions for a picker: a header pinned under the title (a search box that does not scroll away), and `tall`
 * (as high as the screen allows, so a list that grows and shrinks while typing does not make the sheet jump).
 */
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Sheet, Text } from '@/components/kit';
import { ThemeProvider } from '@/theme';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

let tree: TestRenderer.ReactTestRenderer;
const render = (ui: React.ReactElement) => {
  act(() => {
    tree = TestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return tree;
};
afterEach(() => act(() => tree.unmount()));

const panel = () => tree.root.findAll((n: ReactTestInstance) => typeof n.props.accessibilityViewIsModal === 'boolean' && typeof n.type !== 'string')[0]!;
const style = () => StyleSheet.flatten(panel().props.style);
const scroll = () => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown as string) === 'RCTScrollView')[0]!;

describe('Sheet', () => {
  it('is as high as its content, up to what the screen allows, by default', () => {
    render(
      <Sheet visible onClose={() => {}} title="Title">
        <Text>body</Text>
      </Sheet>,
    );
    expect(style().maxHeight).toBeGreaterThan(0);
    expect(style().height).toBeUndefined();
  });

  it('is as high as the screen allows when it is tall, and its body fills the room', () => {
    render(
      <Sheet visible onClose={() => {}} title="Title" tall>
        <Text>body</Text>
      </Sheet>,
    );
    expect(style().height).toBeGreaterThan(0);
    expect(style().maxHeight).toBeUndefined();
    expect(StyleSheet.flatten(scroll().props.style)).toMatchObject({ flexGrow: 1, flexShrink: 1 });
  });

  it('leaves room for the status bar: the screen height less the top inset and a margin, and the keyboard when it is up', () => {
    function Probe() {
      const { height } = useWindowDimensions();
      return <Text testID="h">{String(height)}</Text>;
    }
    render(
      <>
        <Probe />
        <Sheet visible onClose={() => {}} title="Title" tall>
          <Text>body</Text>
        </Sheet>
      </>,
    );
    const windowHeight = Number(tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'h' && (n.type as unknown) === 'Text')[0]!.props.children);
    expect(style().height).toBe(windowHeight - 24 - 20);
  });

  it('pins a header under the title, outside the scrolling body, and has none without one', () => {
    render(
      <Sheet visible onClose={() => {}} title="Title" header={<Text testID="pinned">search</Text>}>
        <Text testID="inside">list</Text>
      </Sheet>,
    );
    expect(scroll().findAll((n: ReactTestInstance) => n.props.testID === 'pinned')).toHaveLength(0);
    expect(scroll().findAll((n: ReactTestInstance) => n.props.testID === 'inside').length).toBeGreaterThan(0);
    expect(tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'pinned').length).toBeGreaterThan(0);
    act(() => tree.unmount());
    render(
      <Sheet visible onClose={() => {}} title="Title">
        <Text testID="inside">list</Text>
      </Sheet>,
    );
    expect(tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'pinned')).toHaveLength(0);
  });
});
