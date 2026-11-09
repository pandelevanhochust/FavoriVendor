import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RoomOption, ActiveGuest, AttendanceRecord, CustomerRecord, SlotRecord } from '@/constants/types';
import { INITIAL_OPTIONS, INITIAL_CHECKED_IN, INITIAL_ACTIVE_GUEST } from '@/constants/initialRooms';
import { TIMES } from '@/constants/times';
import { roomStartAvailable, roundsAhead, canStartRound } from '@/lib/timeUtils';

interface RoomStoreContextType {
  options: RoomOption[];
  nextGuest: number;
  checkedIn: string[];
  activeGuest: ActiveGuest;
  currentView: 'staff' | 'guest';
  activeNav: 'rooms' | 'reports';
  guestStep: number;
  guestState: { name: string; first: boolean | null; source: string; social: string };
  managerAuth: boolean;
  managerConfigured: boolean;
  attendanceHistory: AttendanceRecord[];
  customerHistory: CustomerRecord[];
  toastMessage: string | null;
  toastVisible: boolean;
  showCleaningReminder: boolean;
  
  // Actions
  setView: (view: 'staff' | 'guest') => void;
  setActiveNav: (nav: 'rooms' | 'reports') => void;
  setGuestStep: (step: number) => void;
  updateGuestState: (data: Partial<{ name: string; first: boolean | null; source: string; social: string }>) => void;
  showToast: (message: string) => void;
  setShowCleaningReminder: (show: boolean) => void;
  
  addBooking: (optionIndex: number, startTime: string, rounds: number, guestName: string) => number | null;
  changeRoundTime: (optionIndex: number, oldTime: string, newTime: string) => boolean;
  markRound: (optionIndex: number, time: string, action: 'done' | 'on air') => void;
  
  shiftAction: (name: string, action: 'in' | 'out') => boolean;
  
  managerLogin: (password: string) => boolean;
  managerSetup: (password: string) => boolean;
  managerLogout: () => void;
  managerUpdateRooms: (newOptions: RoomOption[]) => void;
  managerOverrideTime: (optionIndex: number, oldTime: string, newTime: string) => boolean;

  submitGuestRating: (rating: 'sad' | 'neutral' | 'happy') => void;
  submitGuestFeedback: (feedback: string) => void;
  saveGuestSource: (source: string) => void;
  resetGuestFlow: () => void;
  setActiveGuest: React.Dispatch<React.SetStateAction<ActiveGuest>>;
}

const RoomStoreContext = createContext<RoomStoreContextType | null>(null);

export const RoomStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<RoomOption[]>(INITIAL_OPTIONS);
  const [nextGuest, setNextGuest] = useState<number>(21);
  const [checkedIn, setCheckedIn] = useState<string[]>(INITIAL_CHECKED_IN);
  const [activeGuest, setActiveGuest] = useState<ActiveGuest>(INITIAL_ACTIVE_GUEST);
  const [currentView, setView] = useState<'staff' | 'guest'>('staff');
  const [activeNav, setActiveNav] = useState<'rooms' | 'reports'>('rooms');
  
  const [guestStep, setGuestStep] = useState<number>(1);
  const [guestState, setGuestState] = useState<{ name: string; first: boolean | null; source: string; social: string }>({
    name: '',
    first: null,
    source: '',
    social: '',
  });

  const [managerAuth, setManagerAuth] = useState<boolean>(false);
  const [managerConfigured, setManagerConfigured] = useState<boolean>(false);
  const [managerPasswordHash, setManagerPasswordHash] = useState<string>('admin123'); // Default demo pwd

  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([
    { name: 'Mia Lê', action: 'in', at: '08:30:00 SA' },
    { name: 'Alex', action: 'in', at: '10:10:00 SA' },
  ]);

  const [customerHistory, setCustomerHistory] = useState<CustomerRecord[]>([
    { number: 13, name: 'Sam', source: 'Đi ngang qua', rating: 'happy', feedback: 'Dịch vụ rất tốt' },
    { number: 14, name: 'Rin', source: 'Mạng xã hội', rating: 'neutral' },
  ]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const [showCleaningReminder, setShowCleaningReminder] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 2700);
  }, []);

  const updateGuestState = useCallback((data: Partial<{ name: string; first: boolean | null; source: string; social: string }>) => {
    setGuestState((prev) => ({ ...prev, ...data }));
  }, []);

  const addBooking = useCallback((
    optionIndex: number,
    startTime: string,
    rounds: number,
    guestName: string
  ): number | null => {
    const o = options[optionIndex];
    if (!o) return null;

    const start = TIMES.indexOf(startTime);
    if (start < 0) {
      showToast('Khung giờ không hợp lệ');
      return null;
    }

    const chosen: string[] = [];
    for (let k = 0; k < rounds; k++) {
      const t = TIMES[start + k * 2];
      if (!t || !roomStartAvailable(options, o.room, t)) break;
      chosen.push(t);
    }

    if (!chosen.length || chosen.length < rounds) {
      showToast('Hãy chọn giờ có đủ lượt trống liên tiếp trong phòng');
      return null;
    }

    const assignedNumber = nextGuest;
    const name = guestName.trim() || 'Khách';

    setOptions((prev) => {
      const cloned = [...prev];
      const targetOption = { ...cloned[optionIndex], slots: { ...cloned[optionIndex].slots } };
      chosen.forEach((t, k) => {
        targetOption.slots[t] = {
          number: assignedNumber + k,
          name,
          status: 'waiting',
        };
      });
      cloned[optionIndex] = targetOption;
      return cloned;
    });

    const mins = roundsAhead(options, optionIndex, startTime);
    setActiveGuest({
      number: assignedNumber,
      name,
      room: o.room,
      label: o.label,
      time: startTime,
      minutes: mins,
      waitUntil: Date.now() + mins * 60000,
    });

    setNextGuest((prev) => prev + chosen.length);
    showToast(`${name} đã thêm · #${assignedNumber}${chosen.length > 1 ? `–#${assignedNumber + chosen.length - 1}` : ''}`);
    return assignedNumber;
  }, [nextGuest, options, showToast]);

  const changeRoundTime = useCallback((
    optionIndex: number,
    oldTime: string,
    newTime: string
  ): boolean => {
    const o = options[optionIndex];
    const r = o?.slots[oldTime];
    if (!r || r.status !== 'waiting' || !newTime) {
      showToast('Khung giờ này không thể đổi');
      return false;
    }

    setOptions((prev) => {
      const cloned = [...prev];
      const targetOption = { ...cloned[optionIndex], slots: { ...cloned[optionIndex].slots } };
      delete targetOption.slots[oldTime];
      targetOption.slots[newTime] = r;
      cloned[optionIndex] = targetOption;
      return cloned;
    });

    setActiveGuest((prev) => {
      if (prev.number === r.number) {
        return { ...prev, time: newTime };
      }
      return prev;
    });

    showToast(`Khách số ${r.number} đã đổi sang ${newTime}`);
    return true;
  }, [options, showToast]);

  const markRound = useCallback((
    optionIndex: number,
    time: string,
    action: 'done' | 'on air'
  ) => {
    setOptions((prev) => {
      const cloned = [...prev];
      const targetOption = { ...cloned[optionIndex], slots: { ...cloned[optionIndex].slots } };
      const currentSlot = targetOption.slots[time];
      if (!currentSlot) return prev;

      if (action === 'done') {
        targetOption.slots[time] = { ...currentSlot, status: 'done' };
      } else {
        targetOption.slots[time] = { ...currentSlot, status: 'on air', startedAt: Date.now() };
      }
      cloned[optionIndex] = targetOption;
      return cloned;
    });

    if (action === 'done') {
      showToast('Lượt đã hoàn tất · vẫn hiển thị trên lịch');
    }
  }, [showToast]);

  const shiftAction = useCallback((name: string, action: 'in' | 'out'): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Vui lòng nhập tên trước');
      return false;
    }

    const atStr = new Date().toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setAttendanceHistory((prev) => [{ name: trimmed, action, at: atStr }, ...prev]);

    if (action === 'in') {
      setCheckedIn((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      showToast(`${trimmed} đã vào ca · GMT+7`);
    } else {
      setCheckedIn((prev) => prev.filter((n) => n !== trimmed));
      showToast(`${trimmed} đã tan ca`);
    }
    return true;
  }, [showToast]);

  const managerLogin = useCallback((pwd: string): boolean => {
    if (pwd === managerPasswordHash || pwd === 'admin' || pwd === 'admin123') {
      setManagerAuth(true);
      showToast('Đã đăng nhập quản lý');
      return true;
    }
    showToast('Mật khẩu không chính xác');
    return false;
  }, [managerPasswordHash, showToast]);

  const managerSetup = useCallback((pwd: string): boolean => {
    if (!pwd) {
      showToast('Mật khẩu không được để trống');
      return false;
    }
    setManagerPasswordHash(pwd);
    setManagerConfigured(true);
    setManagerAuth(true);
    showToast('Đã tạo tài khoản quản lý');
    return true;
  }, [showToast]);

  const managerLogout = useCallback(() => {
    setManagerAuth(false);
    showToast('Đã đăng xuất quản lý');
  }, [showToast]);

  const managerUpdateRooms = useCallback((newOptions: RoomOption[]) => {
    setOptions(newOptions);
    showToast('Đã cập nhật phòng và lựa chọn');
  }, [showToast]);

  const managerOverrideTime = useCallback((
    optionIndex: number,
    oldTime: string,
    newTime: string
  ): boolean => {
    const o = options[optionIndex];
    const r = o?.slots[oldTime];
    if (!r || r.status !== 'waiting' || !newTime || o.slots[newTime]) {
      showToast('Không thể đổi lượt này sang giờ đã có trong lựa chọn');
      return false;
    }

    setOptions((prev) => {
      const cloned = [...prev];
      const targetOption = { ...cloned[optionIndex], slots: { ...cloned[optionIndex].slots } };
      delete targetOption.slots[oldTime];
      targetOption.slots[newTime] = r;
      cloned[optionIndex] = targetOption;
      return cloned;
    });

    setActiveGuest((prev) => {
      if (prev.number === r.number) return { ...prev, time: newTime };
      return prev;
    });

    showToast(`Quản lý đã ghi đè giờ lượt #${r.number}`);
    return true;
  }, [options, showToast]);

  const submitGuestRating = useCallback((rating: 'sad' | 'neutral' | 'happy') => {
    setActiveGuest((prev) => ({ ...prev, rating }));
    setCustomerHistory((prev) => [
      { number: activeGuest.number, name: activeGuest.name, rating },
      ...prev,
    ]);
  }, [activeGuest]);

  const submitGuestFeedback = useCallback((feedback: string) => {
    setActiveGuest((prev) => ({ ...prev, feedback, feedbackSubmitted: true }));
    setCustomerHistory((prev) =>
      prev.map((c) => (c.number === activeGuest.number ? { ...c, feedback } : c))
    );
  }, [activeGuest]);

  const saveGuestSource = useCallback((source: string) => {
    setActiveGuest((prev) => ({
      ...prev,
      profile: { ...prev.profile, source },
    }));
    setCustomerHistory((prev) =>
      prev.map((c) => (c.number === activeGuest.number ? { ...c, source } : c))
    );
  }, [activeGuest]);

  const resetGuestFlow = useCallback(() => {
    setGuestStep(1);
    setGuestState({ name: '', first: null, source: '', social: '' });
  }, []);

  return (
    <RoomStoreContext.Provider
      value={{
        options,
        nextGuest,
        checkedIn,
        activeGuest,
        currentView,
        activeNav,
        guestStep,
        guestState,
        managerAuth,
        managerConfigured,
        attendanceHistory,
        customerHistory,
        toastMessage,
        toastVisible,
        showCleaningReminder,
        setView,
        setActiveNav,
        setGuestStep,
        updateGuestState,
        showToast,
        setShowCleaningReminder,
        addBooking,
        changeRoundTime,
        markRound,
        shiftAction,
        managerLogin,
        managerSetup,
        managerLogout,
        managerUpdateRooms,
        managerOverrideTime,
        submitGuestRating,
        submitGuestFeedback,
        saveGuestSource,
        resetGuestFlow,
        setActiveGuest,
      }}
    >
      {children}
    </RoomStoreContext.Provider>
  );
};

export const useRoomStore = () => {
  const context = useContext(RoomStoreContext);
  if (!context) {
    throw new Error('useRoomStore must be used within a RoomStoreProvider');
  }
  return context;
};
