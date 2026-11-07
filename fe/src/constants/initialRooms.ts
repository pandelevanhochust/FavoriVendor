import { RoomOption, ActiveGuest } from './types';

export const INITIAL_OPTIONS: RoomOption[] = [
  {
    room: 'Phòng yên tĩnh',
    label: 'A',
    slots: {
      '10:20': { number: 13, name: 'Sam', status: 'done' },
      '10:30': { number: 14, name: 'Rin', status: 'on air', startedAt: Date.now() - 4 * 60000 },
      '10:40': { number: 15, name: 'Khách', status: 'waiting' },
    },
  },
  {
    room: 'Phòng yên tĩnh',
    label: 'B',
    slots: {
      '10:20': { number: 16, name: 'Khách', status: 'waiting' },
      '10:30': { number: 17, name: 'Khách', status: 'waiting' },
    },
  },
  {
    room: 'Phòng vườn',
    label: 'A',
    slots: {
      '10:30': { number: 18, name: 'Khách', status: 'done' },
      '10:40': { number: 19, name: 'Khách', status: 'on air', startedAt: Date.now() - 2 * 60000 },
      '10:50': { number: 20, name: 'Khách', status: 'waiting' },
    },
  },
  {
    room: 'Phòng vườn',
    label: 'B',
    slots: {},
  },
];

export const INITIAL_CHECKED_IN: string[] = ['Mia Lê'];

export const INITIAL_ACTIVE_GUEST: ActiveGuest = {
  number: 20,
  name: 'Khách',
  room: 'Phòng vườn',
  label: 'A',
  time: '10:50',
  minutes: 8,
};
