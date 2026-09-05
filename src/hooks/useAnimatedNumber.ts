import { useEffect, useRef, useState } from "react";
import { num } from "../utils/format";

/**
 * Плавная визуальная интерполяция к реальному значению.
 * Конечное значение всегда равно последнему числу от ESP32.
 * null / NaN не анимируются — сразу "—".
 */
export function useAnimatedNumber(target: unknown, duration = 450): number | null {
  const value = num(target);
  const [shown, setShown] = useState<number | null>(value);
  const fromRef = useRef<number | null>(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (value === null) {
      fromRef.current = null;
      setShown(null);
      return;
    }
    const from = fromRef.current;
    if (from === null || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const fromV = from;
    const toV = value;
    cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      const v = fromV + (toV - fromV) * eased;
      setShown(v);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = toV;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return shown;
}
