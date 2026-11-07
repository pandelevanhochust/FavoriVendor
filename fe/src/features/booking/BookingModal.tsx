import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';
import { TIMES } from '@/constants/times';
import { roomStartAvailable, timeMinutes, getVNTimeNow } from '@/lib/timeUtils';

export interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOptionIndex?: number;
  initialTime?: string;
  onShowQR: (num: number, name: string, time: string) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  initialOptionIndex = 0,
  initialTime = '10:40',
  onShowQR,
}) => {
  const { options, addBooking } = useRoomStore();

  const [selectedRoom, setSelectedRoom] = useState<string>(
    options[initialOptionIndex]?.room || options[0]?.room || ''
  );
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(initialOptionIndex);
  const [spacing, setSpacing] = useState<number>(5);
  const [selectedTime, setSelectedTime] = useState<string>(initialTime);
  const [selectedRounds, setSelectedRounds] = useState<number>(1);
  const [guestName, setGuestName] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const opt = options[initialOptionIndex] || options[0];
      if (opt) {
        setSelectedRoom(opt.room);
        setSelectedOptionIndex(initialOptionIndex);
      }
      setSelectedTime(initialTime);
      setSelectedRounds(1);
      setGuestName('');
    }
  }, [isOpen, initialOptionIndex, initialTime, options]);

  // Options matching the selected room
  const availableOptionsForRoom = useMemo(() => {
    return options
      .map((opt, i) => ({ opt, index: i }))
      .filter(({ opt }) => opt.room === selectedRoom);
  }, [options, selectedRoom]);

  // Available start times
  const freeTimes = useMemo(() => {
    const opt = options[selectedOptionIndex];
    if (!opt) return [];
    const current = getVNTimeNow();
    const list = TIMES.filter((t) => {
      return (
        t >= current &&
        timeMinutes(t) % spacing === 0 &&
        roomStartAvailable(options, opt.room, t)
      );
    });

    if (
      initialTime &&
      TIMES.includes(initialTime) &&
      timeMinutes(initialTime) % spacing === 0 &&
      roomStartAvailable(options, opt.room, initialTime) &&
      !list.includes(initialTime)
    ) {
      list.push(initialTime);
    }

    list.sort((a, b) => timeMinutes(a) - timeMinutes(b));
    return list;
  }, [options, selectedOptionIndex, spacing, initialTime]);

  // Update selected time if current selection is not in freeTimes
  useEffect(() => {
    if (freeTimes.length > 0 && !freeTimes.includes(selectedTime)) {
      setSelectedTime(freeTimes[0]);
    }
  }, [freeTimes, selectedTime]);

  // Max consecutive rounds
  const maxRounds = useMemo(() => {
    const opt = options[selectedOptionIndex];
    if (!opt || !selectedTime) return 1;
    const start = TIMES.indexOf(selectedTime);
    if (start < 0) return 1;

    let max = 0;
    for (let i = start; i < TIMES.length; i += 2) {
      if (!roomStartAvailable(options, opt.room, TIMES[i])) break;
      max++;
    }
    return Math.max(1, max);
  }, [options, selectedOptionIndex, selectedTime]);

  const handleRoomChange = (room: string) => {
    setSelectedRoom(room);
    const firstOption = options.findIndex((o) => o.room === room);
    if (firstOption >= 0) setSelectedOptionIndex(firstOption);
  };

  const currentOption = options[selectedOptionIndex] || options[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTime) return;
    const assigned = addBooking(selectedOptionIndex, selectedTime, selectedRounds, guestName);
    if (assigned !== null) {
      onClose();
      setTimeout(() => {
        onShowQR(assigned, guestName.trim() || 'Khách', selectedTime);
      }, 250);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Đón khách"
      subtitle={`${currentOption?.room} · Lựa chọn ${currentOption?.label} · ${selectedTime} trở đi`}
    >
      <form onSubmit={handleSubmit}>
        <div className="formrow">
          <div className="field">
            <label>Phòng</label>
            <select
              value={selectedRoom}
              onChange={(e) => handleRoomChange(e.target.value)}
            >
              {Array.from(new Set(options.map((a) => a.room))).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Lựa chọn</label>
            <select
              value={selectedOptionIndex}
              onChange={(e) => setSelectedOptionIndex(Number(e.target.value))}
            >
              {availableOptionsForRoom.map(({ opt, index }) => (
                <option key={opt.label} value={index}>
                  Lựa chọn {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="formrow">
          <div className="field">
            <label>Giờ bắt đầu · GMT+7</label>
            <select
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
            >
              {freeTimes.length > 0 ? (
                freeTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))
              ) : (
                <option value="">Không còn khung giờ sắp tới</option>
              )}
            </select>
          </div>
          <div className="field">
            <label>Khoảng cách giờ bắt đầu</label>
            <select
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
            >
              <option value={5}>Mỗi 5 phút</option>
              <option value={10}>Mỗi 10 phút</option>
            </select>
          </div>
        </div>

        <div className="formrow">
          <div className="field">
            <label>Số lượt</label>
            <select
              value={selectedRounds}
              onChange={(e) => setSelectedRounds(Number(e.target.value))}
            >
              {Array.from({ length: maxRounds }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              Tên khách <span style={{ color: '#a6afa7' }}>· không bắt buộc</span>
            </label>
            <input
              placeholder="Tên để gọi khách"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
        </div>

        <Button variant="primary" full type="submit">
          Tạo lượt & hiển thị mã QR
        </Button>
      </form>
    </Modal>
  );
};
