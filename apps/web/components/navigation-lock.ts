"use client";
import { useEffect, useId, useSyncExternalStore } from "react";
const locks = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => locks.size > 0;
const serverSnapshot = () => false;
function publish() {
  for (const fn of listeners) fn();
}
export function useNavigationLocked() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
export function useNavigationLock(active: boolean) {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    locks.add(id);
    publish();
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      locks.delete(id);
      publish();
      window.removeEventListener("beforeunload", leave);
    };
  }, [active, id]);
}
