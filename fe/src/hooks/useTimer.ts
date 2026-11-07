import { useState, useEffect } from 'react';

export const useTimer = (intervalMs: number = 1000) => {
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTicks((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return ticks;
};
