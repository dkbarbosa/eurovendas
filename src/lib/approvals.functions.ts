import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Approval } from "@/components/aprovacoes/types";

export const getApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Approval[]> => {
    const { readApprovals } = await import("./approvals.server");
    return readApprovals();
  });
