import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAgendamentos, type AgendamentoEvent } from "@/lib/agendamentos.functions";

const REFRESH_MS = 90_000;

export function useAgendamentos() {
  const fn = useServerFn(listAgendamentos);
  return useQuery({
    queryKey: ["agendamentos"],
    queryFn: async () => {
      const r = (await fn({ data: {} })) as {
        ok: boolean;
        events: AgendamentoEvent[];
        error: string | null;
      };
      if (!r.ok) throw new Error(r.error ?? "Falha ao carregar agendamentos");
      return r.events;
    },
    refetchInterval: REFRESH_MS,
    staleTime: 30_000,
  });
}
