import React from 'react';
import { Mic, Pencil } from 'lucide-react-native';
import { ListGroup, ListRow, Sheet } from '@/components/kit';

/**
 * What the + on Today opens: the two ways to log food. (Per-meal "Add to lunch" rows skip this
 * and go straight to manual entry.)
 */
export function AddMenuSheet({
  visible,
  onClose,
  onVoice,
  onManual,
}: {
  visible: boolean;
  onClose: () => void;
  onVoice: () => void;
  onManual: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Log food">
      <ListGroup>
        <ListRow
          testID="talk-now"
          tile
          icon={Mic}
          title="Talk to the assistant"
          subtitle="Say what you ate and it logs it for you"
          onPress={() => {
            onClose();
            onVoice();
          }}
        />
        <ListRow
          testID="add-food"
          tile
          icon={Pencil}
          title="Add manually"
          subtitle="Type the foods and quantities yourself"
          onPress={() => {
            onClose();
            onManual();
          }}
        />
      </ListGroup>
    </Sheet>
  );
}
