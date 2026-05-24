import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SALE_STATUSES = ["RESERVADO", "ASSINADO", "CAIXA", "PAGO", "DISTRATO"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

const SetStatusSchema = z.object({
  sale_id: z.string().uuid(),
  status: z.enum(SALE_STATUSES),
});

async function assertFinanceiro(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.includes("financeiro") && !roles.includes("admin"))
    throw new Error("Acesso negado: apenas Financeiro.");
}

export const setSaleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertFinanceiro(context.userId);

    const { data: sale, error: selErr } = await supabaseAdmin
      .from("sales")
      .select("id,data,empreendimento,unidade,comprador,valor_venda,status")
      .eq("id", data.sale_id)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!sale) throw new Error("Venda não encontrada.");

    if ((sale.status ?? "").toUpperCase() === data.status) {
      return { ok: true, status: data.status, sheetWarning: undefined as string | undefined };
    }

    const { error: updErr } = await supabaseAdmin
      .from("sales")
      .update({ status: data.status })
      .eq("id", data.sale_id);
    if (updErr) throw new Error(updErr.message);

    let sheetWarning: string | undefined;
    try {
      const { setSheetStatus } = await import("./sheets-write.server");
      const res = await setSheetStatus(
        {
          data: sale.data,
          empreendimento: sale.empreendimento,
          unidade: sale.unidade,
          comprador: sale.comprador,
          valor_venda: sale.valor_venda,
        },
        data.status,
      );
      if (!res.ok) sheetWarning = res.error;
    } catch (e) {
      sheetWarning = e instanceof Error ? e.message : String(e);
    }

    return { ok: true, status: data.status, sheetWarning };
  });
