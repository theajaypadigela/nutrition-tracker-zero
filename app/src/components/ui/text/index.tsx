import React, { forwardRef } from 'react';
import { Text as RNText } from 'react-native';
import { textStyle } from './styles';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { cssInterop } from 'nativewind';

type ITextProps = VariantProps<typeof textStyle> &
  React.ComponentPropsWithoutRef<typeof RNText>;

cssInterop(RNText, { className: 'style' });

const Text = forwardRef<React.ComponentRef<typeof RNText>, ITextProps>(
  function Text(
    {
      size,
      className,
      isTruncated,
      bold,
      underline,
      strikeThrough,
      sub,
      italic,
      highlight,
      ...props
    },
    ref
  ) {
    return (
      <RNText
        className={textStyle({
          size,
          isTruncated: isTruncated as boolean,
          bold: bold as boolean,
          underline: underline as boolean,
          strikeThrough: strikeThrough as boolean,
          sub: sub as boolean,
          italic: italic as boolean,
          highlight: highlight as boolean,
          class: className,
        })}
        {...props}
        ref={ref}
      />
    );
  }
);

Text.displayName = 'Text';

export { Text };
