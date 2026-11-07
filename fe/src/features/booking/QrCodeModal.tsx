import React from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { QrCode } from '@/components/QrCode';
import { useRoomStore } from '@/store/roomStore';

export interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  guestNumber: number;
  guestName: string;
  time: string;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  guestNumber,
  guestName,
  time,
}) => {
  const { setView } = useRoomStore();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mã QR đón khách"
      subtitle={`Khách số ${guestNumber} · ${guestName} · ${time}`}
    >
      <QrCode />
      <div
        style={{
          textAlign: 'center',
          color: '#7d897f',
          fontSize: '11px',
          marginBottom: '16px',
        }}
      >
        Khách quét mã này để mở trang chào mừng riêng.
      </div>
      <Button
        variant="primary"
        full
        onClick={() => {
          onClose();
          setView('guest');
        }}
      >
        Xem trước màn hình khách
      </Button>
    </Modal>
  );
};
