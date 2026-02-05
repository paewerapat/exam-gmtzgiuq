'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseTimerOptions {
  autoStart?: boolean;
  onTick?: (seconds: number) => void;
}

interface UseTimerReturn {
  seconds: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: (newSeconds?: number) => void;
  setSeconds: (seconds: number) => void;
}

export function useTimer(
  initialSeconds: number = 0,
  options: UseTimerOptions = {},
): UseTimerReturn {
  const { autoStart = true, onTick } = options;
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTickRef = useRef(onTick);

  // Keep onTick ref updated
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  // Timer interval
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const newSeconds = prev + 1;
          onTickRef.current?.(newSeconds);
          return newSeconds;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback((newSeconds: number = 0) => {
    setSeconds(newSeconds);
    setIsRunning(false);
  }, []);

  const setSecondsManually = useCallback((newSeconds: number) => {
    setSeconds(newSeconds);
  }, []);

  return {
    seconds,
    isRunning,
    start,
    pause,
    reset,
    setSeconds: setSecondsManually,
  };
}

export default useTimer;
