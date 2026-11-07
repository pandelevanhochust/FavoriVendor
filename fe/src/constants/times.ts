// 25 time slots from 10:00 (600 mins) to 12:00 (720 mins) in 5-minute increments
export const TIMES: string[] = Array.from({ length: 25 }, (_, i) => {
  const n = 600 + i * 5;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
});
