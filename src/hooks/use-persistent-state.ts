import { useEffect, useRef, useState } from "react";

/**
 * useState que persiste em sessionStorage — sobrevive a mudanças de rota
 * (mudar de aba/menu) dentro da mesma aba do navegador. Limpa ao recarregar
 * o navegador apenas se a sessão for fechada.
 */
export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `lv:${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value]);
  return [value, setValue];
}
