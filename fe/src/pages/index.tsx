import React, { useState } from 'react';
import { MainLayout } from '@/layouts/MainLayout';
import { TopBar } from '@/layouts/TopBar';
import { StaffPanel } from '@/features/rooms/StaffPanel';
import { GuestPanel } from '@/features/guest/GuestPanel';
import { BookingModal } from '@/features/booking/BookingModal';
import { RoundDetailModal } from '@/features/booking/RoundDetailModal';
import { ChangeRoundTimeModal } from '@/features/booking/ChangeRoundTimeModal';
import { QrCodeModal } from '@/features/booking/QrCodeModal';
import { ShiftAttendanceModal } from '@/features/shifts/ShiftAttendanceModal';
import { ManagerAccessModal } from '@/features/manager/ManagerAccessModal';
import { ManagerRoomEditorModal } from '@/features/manager/ManagerRoomEditorModal';
import { ManagerStorageModal } from '@/features/manager/ManagerStorageModal';
import { ManagerOverrideTimeModal } from '@/features/manager/ManagerOverrideTimeModal';
import { ReportsView } from '@/features/reports/ReportsView';
import { useRoomStore } from '@/store/roomStore';

export default function HomePage() {
  const { currentView, activeNav } = useRoomStore();

  // Booking Modal State
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingOptionIndex, setBookingOptionIndex] = useState(0);
  const [bookingTime, setBookingTime] = useState('10:40');

  // Round Detail Modal State
  const [roundModalOpen, setRoundModalOpen] = useState(false);
  const [selectedRoundOptionIdx, setSelectedRoundOptionIdx] = useState(0);
  const [selectedRoundTime, setSelectedRoundTime] = useState('');

  // Change Round Time Modal State
  const [changeTimeModalOpen, setChangeTimeModalOpen] = useState(false);

  // QR Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrGuestNumber, setQrGuestNumber] = useState(0);
  const [qrGuestName, setQrGuestName] = useState('');
  const [qrTime, setQrTime] = useState('');

  // Shift Modal State
  const [shiftModalOpen, setShiftModalOpen] = useState(false);

  // Manager Modals State
  const [managerAccessOpen, setManagerAccessOpen] = useState(false);
  const [managerRoomsOpen, setManagerRoomsOpen] = useState(false);
  const [managerStorageOpen, setManagerStorageOpen] = useState(false);
  const [managerOverrideOpen, setManagerOverrideOpen] = useState(false);

  const handleOpenBooking = (optionIndex: number = 0, time: string = '10:40') => {
    setBookingOptionIndex(optionIndex);
    setBookingTime(time);
    setBookingOpen(true);
  };

  const handleOpenRound = (optionIndex: number, time: string) => {
    setSelectedRoundOptionIdx(optionIndex);
    setSelectedRoundTime(time);
    setRoundModalOpen(true);
  };

  const handleShowQR = (num: number, name: string, time: string) => {
    setQrGuestNumber(num);
    setQrGuestName(name);
    setQrTime(time);
    setQrModalOpen(true);
  };

  const handleOpenChangeTime = (optionIndex: number, time: string) => {
    setRoundModalOpen(false);
    setSelectedRoundOptionIdx(optionIndex);
    setSelectedRoundTime(time);
    setChangeTimeModalOpen(true);
  };

  const handleOpenOverrideTime = (optionIndex: number, time: string) => {
    setRoundModalOpen(false);
    setSelectedRoundOptionIdx(optionIndex);
    setSelectedRoundTime(time);
    setManagerOverrideOpen(true);
  };

  return (
    <MainLayout>
      <TopBar
        onOpenManagerAccess={() => setManagerAccessOpen(true)}
        onOpenManagerRooms={() => setManagerRoomsOpen(true)}
        onOpenManagerStorage={() => setManagerStorageOpen(true)}
      />

      {activeNav === 'reports' ? (
        <ReportsView />
      ) : currentView === 'staff' ? (
        <StaffPanel
          onOpenBooking={handleOpenBooking}
          onOpenRound={handleOpenRound}
          onOpenShiftModal={() => setShiftModalOpen(true)}
        />
      ) : (
        <GuestPanel />
      )}

      {/* Modals */}
      <BookingModal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        initialOptionIndex={bookingOptionIndex}
        initialTime={bookingTime}
        onShowQR={handleShowQR}
      />

      <RoundDetailModal
        isOpen={roundModalOpen}
        onClose={() => setRoundModalOpen(false)}
        optionIndex={selectedRoundOptionIdx}
        time={selectedRoundTime}
        onShowQR={handleShowQR}
        onOpenChangeTime={handleOpenChangeTime}
        onOpenOverrideTime={handleOpenOverrideTime}
      />

      <ChangeRoundTimeModal
        isOpen={changeTimeModalOpen}
        onClose={() => setChangeTimeModalOpen(false)}
        optionIndex={selectedRoundOptionIdx}
        time={selectedRoundTime}
      />

      <QrCodeModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        guestNumber={qrGuestNumber}
        guestName={qrGuestName}
        time={qrTime}
      />

      <ShiftAttendanceModal
        isOpen={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
      />

      <ManagerAccessModal
        isOpen={managerAccessOpen}
        onClose={() => setManagerAccessOpen(false)}
      />

      <ManagerRoomEditorModal
        isOpen={managerRoomsOpen}
        onClose={() => setManagerRoomsOpen(false)}
      />

      <ManagerStorageModal
        isOpen={managerStorageOpen}
        onClose={() => setManagerStorageOpen(false)}
      />

      <ManagerOverrideTimeModal
        isOpen={managerOverrideOpen}
        onClose={() => setManagerOverrideOpen(false)}
        optionIndex={selectedRoundOptionIdx}
        time={selectedRoundTime}
      />
    </MainLayout>
  );
}
