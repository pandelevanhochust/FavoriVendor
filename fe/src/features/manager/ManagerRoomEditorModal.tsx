import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';
import { RoomOption } from '@/constants/types';

export interface ManagerRoomEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RoomGroupDraft {
  name: string;
  options: {
    label: string;
    slots: RoomOption['slots'];
  }[];
}

export const ManagerRoomEditorModal: React.FC<ManagerRoomEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { options, managerUpdateRooms, showToast } = useRoomStore();
  const [draft, setDraft] = useState<RoomGroupDraft[]>([]);

  useEffect(() => {
    if (isOpen) {
      const roomNames = Array.from(new Set(options.map((o) => o.room)));
      const initialDraft: RoomGroupDraft[] = roomNames.map((name) => ({
        name,
        options: options
          .filter((o) => o.room === name)
          .map((o) => ({ label: o.label, slots: o.slots })),
      }));
      setDraft(initialDraft);
    }
  }, [isOpen, options]);

  const handleRoomNameChange = (groupIndex: number, newName: string) => {
    setDraft((prev) => {
      const cloned = [...prev];
      cloned[groupIndex] = { ...cloned[groupIndex], name: newName };
      return cloned;
    });
  };

  const handleOptionLabelChange = (
    groupIndex: number,
    optionIndex: number,
    newLabel: string
  ) => {
    setDraft((prev) => {
      const cloned = [...prev];
      const opts = [...cloned[groupIndex].options];
      opts[optionIndex] = { ...opts[optionIndex], label: newLabel };
      cloned[groupIndex] = { ...cloned[groupIndex], options: opts };
      return cloned;
    });
  };

  const addOption = (groupIndex: number) => {
    setDraft((prev) => {
      const cloned = [...prev];
      const group = cloned[groupIndex];
      const usedLabels = group.options.map((o) => o.label);
      let nextChar = 'A';
      while (usedLabels.includes(nextChar)) {
        nextChar = String.fromCharCode(nextChar.charCodeAt(0) + 1);
      }
      cloned[groupIndex] = {
        ...group,
        options: [...group.options, { label: nextChar, slots: {} }],
      };
      return cloned;
    });
  };

  const removeOption = (groupIndex: number, optionIndex: number) => {
    const group = draft[groupIndex];
    const option = group.options[optionIndex];
    if (Object.keys(option.slots || {}).length > 0) {
      showToast('Không thể xóa lựa chọn đang có lượt đã đặt');
      return;
    }
    setDraft((prev) => {
      const cloned = [...prev];
      const opts = [...cloned[groupIndex].options];
      opts.splice(optionIndex, 1);
      cloned[groupIndex] = { ...cloned[groupIndex], options: opts };
      return cloned;
    });
  };

  const handleSave = () => {
    const newOptions: RoomOption[] = draft.flatMap((group) =>
      group.options.map((option) => ({
        room: group.name.trim() || 'Phòng',
        label: option.label.trim() || 'A',
        slots: option.slots || {},
      }))
    );
    managerUpdateRooms(newOptions);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chỉnh sửa phòng"
      subtitle="Đổi tên phòng và các lựa chọn. Lịch đã đặt sẽ được giữ nguyên."
    >
      <div className="manager-room-list">
        {draft.map((group, gi) => (
          <section key={gi} className="manager-room-editor">
            <div className="field">
              <label>Tên phòng</label>
              <input
                value={group.name}
                onChange={(e) => handleRoomNameChange(gi, e.target.value)}
              />
            </div>
            {group.options.map((option, oi) => {
              const hasSlots = Object.keys(option.slots || {}).length > 0;
              return (
                <div key={oi} className="manager-option-editor">
                  <label>Lựa chọn</label>
                  <input
                    value={option.label}
                    onChange={(e) => handleOptionLabelChange(gi, oi, e.target.value)}
                  />
                  <Button
                    size="small"
                    disabled={hasSlots}
                    title={hasSlots ? 'Lựa chọn đang có lượt đã đặt' : undefined}
                    onClick={() => removeOption(gi, oi)}
                  >
                    Xóa
                  </Button>
                </div>
              );
            })}
            <Button size="small" onClick={() => addOption(gi)}>
              ＋ Thêm lựa chọn
            </Button>
          </section>
        ))}
      </div>
      <Button variant="primary" full onClick={handleSave}>
        Lưu cấu hình phòng
      </Button>
    </Modal>
  );
};
