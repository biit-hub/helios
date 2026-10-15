"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { routineRequest } from "./routine-http";
export function useRoutineResource<T>(
  url: string,
  version: string | number,
  interval?: number,
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const result: T = await routineRequest(url);
      if (ticket === sequence.current) {
        setData(result);
        setError("");
      }
      return result;
    } catch (e) {
      if (ticket === sequence.current) setError((e as Error).message);
      throw e;
    }
  }, [url]);
  useEffect(() => {
    let active = true;
    const read = () => {
      const ticket = ++sequence.current;
      void routineRequest(url)
        .then((value: T) => {
          if (active && ticket === sequence.current) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (active && ticket === sequence.current) setError(e.message);
        });
    };
    read();
    const timer = interval ? setInterval(read, interval) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [url, version, interval]);
  return { data, error, reload };
}
