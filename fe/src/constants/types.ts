export type RoundStatus = 'done' | 'on air' | 'waiting' | 'remind';

export interface SlotRecord {
  number: number;
  name: string;
  status: RoundStatus;
  startedAt?: number;
  readyAt?: number;
  reminded?: boolean;
}

export interface RoomOption {
  room: string;
  label: string;
  slots: Record<string, SlotRecord>;
}

export interface ActiveGuest {
  number: number;
  name: string;
  room: string;
  label: string;
  time: string;
  minutes: number;
  waitUntil?: number;
  rating?: 'sad' | 'neutral' | 'happy';
  feedback?: string;
  feedbackSubmitted?: boolean;
  profile?: {
    name?: string;
    firstVisit?: boolean | null;
    source?: string;
    social?: string;
  };
}

export interface AttendanceRecord {
  name: string;
  action: 'in' | 'out';
  at: string;
}

export interface CustomerRecord {
  number: number;
  name: string;
  source?: string;
  rating?: 'sad' | 'neutral' | 'happy';
  feedback?: string;
}
