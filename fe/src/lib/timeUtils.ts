import { TIMES } from '@/constants/times';
import { RoomOption, SlotRecord } from '@/constants/types';

export function timeMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function elapsed(record?: SlotRecord): number {
  if (!record || record.status !== 'on air' || !record.startedAt) return 0;
  return Math.max(0, 600000 - (Date.now() - record.startedAt));
}

export function roomStartAvailable(options: RoomOption[], room: string, time: string): boolean {
  const index = TIMES.indexOf(time);
  if (index < 0 || index + 1 >= TIMES.length) return false;
  const target = timeMinutes(time);
  return !options
    .filter((o) => o.room === room)
    .some((o) =>
      Object.entries(o.slots).some(
        ([t, r]) => r.status !== 'done' && Math.abs(timeMinutes(t) - target) < 10
      )
    );
}

export function roomStartAvailableExcept(
  options: RoomOption[],
  room: string,
  time: string,
  ignored: SlotRecord
): boolean {
  const index = TIMES.indexOf(time);
  if (index < 0 || index + 1 >= TIMES.length) return false;
  const target = timeMinutes(time);
  return !options
    .filter((o) => o.room === room)
    .some((o) =>
      Object.entries(o.slots).some(
        ([t, r]) => r !== ignored && r.status !== 'done' && Math.abs(timeMinutes(t) - target) < 10
      )
    );
}

export function canStartRound(options: RoomOption[], idx: number, time: string): boolean {
  const target = options[idx]?.slots[time];
  if (!target) return false;
  const roomOptions = options.filter((o) => o.room === options[idx].room);
  const targetMinute = timeMinutes(time);

  if (roomOptions.some((o) => Object.values(o.slots).some((r) => r !== target && r.status === 'on air'))) {
    return false;
  }

  return !roomOptions.some((o) =>
    Object.entries(o.slots).some(([t, r]) => {
      if (r === target || r.status === 'done') return false;
      const m = timeMinutes(t);
      return m < targetMinute || (m === targetMinute && r.number < target.number);
    })
  );
}

export function roomWaitMs(options: RoomOption[], idx: number, time: string): number {
  const target = options[idx]?.slots[time];
  if (!target) return 0;
  const targetMinute = timeMinutes(time);
  let ms = 0;
  for (const o of options.filter((o) => o.room === options[idx].room)) {
    for (const [t, r] of Object.entries(o.slots)) {
      const m = timeMinutes(t);
      if (r.status === 'done' || m > targetMinute || (m === targetMinute && r.number >= target.number)) {
        continue;
      }
      if (r.status === 'on air') ms += elapsed(r);
      else if (r.status === 'waiting') ms += 600000;
    }
  }
  return ms;
}

export function roundsAhead(options: RoomOption[], idx: number, time: string): number {
  return Math.ceil(roomWaitMs(options, idx, time) / 60000);
}

export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function getVNTimeNow(): string {
  try {
    return new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
