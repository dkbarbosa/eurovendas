import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "corretor" | "gerente" | "diretor";

const RoleSchema = z.object({ role: z.enum(["corretor", "gerente", "diretor"]) });

const PROMPTS: Record<Role, { sistema: string; usuario: string }> = {
  corretor: {
    sistema:
      "Você é um mentor de alta performance para corretores de imóveis no Brasil. Tom direto, energético, prático. Use linguagem brasileira moderna, evite clichês manjados.",
    usuario:
      "Gere para HOJE uma frase de motivação curta (máx. 18 palavras) sobre vendas/prospecção/fechamento para um corretor de imóveis E uma ação prática do dia: algo concreto a executar em 30-60 min (follow-up estruturado, prospecção fria, estudo de objeção, técnica de fechamento). Varie sempre o tema.",
  },
  gerente: {
    sistema:
      "Você é um mentor de líderes comerciais no mercado imobiliário brasileiro. Foco em liderança, gestão de funil, performance de time.",
    usuario:
      "Gere para HOJE uma frase de liderança curta (máx. 18 palavras) para um gerente de equipe de corretores E uma ação prática do dia (1:1 com corretor, revisão de funil, coaching de objeção, ritual de time).",
  },
  diretor: {
    sistema:
      "Você é um conselheiro estratégico para diretores comerciais de incorporadoras brasileiras. Foco em visão de mercado, indicadores e cultura.",
    usuario:
      "Gere para HOJE uma frase estratégica curta (máx. 18 palavras) para um diretor comercial E uma ação prática do dia (análise de KPI, conversa com gerência, leitura de mercado, decisão de portfólio).",
  },
};

function getDateKeySaoPaulo(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const h = parseInt(get("hour"), 10);
  let date = new Date(`${y}-${m}-${d}T12:00:00Z`);
  if (h < 8) date = new Date(date.getTime() - 86400000);
  return date.toISOString().slice(0, 10);
}

async function generateFromAI(role: Role): Promise<{ frase: string; acao_titulo: string; acao_descricao: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente.");
  const p = PROMPTS[role];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "manual-fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: p.sistema },
        {
          role: "user",
          content:
            p.usuario +
            '\n\nResponda APENAS em JSON estrito no formato: {"frase":"...","acao_titulo":"...","acao_descricao":"..."}. ' +
            "acao_titulo: 3-7 palavras. acao_descricao: 1-2 frases, no máximo 35 palavras. Sem emojis. Sem aspas extras.",
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: { choices?: { message?: { content?: string } }[] } = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content);
  if (!parsed.frase || !parsed.acao_titulo || !parsed.acao_descricao) {
    throw new Error("Resposta da IA incompleta.");
  }
  return {
    frase: String(parsed.frase).trim(),
    acao_titulo: String(parsed.acao_titulo).trim(),
    acao_descricao: String(parsed.acao_descricao).trim(),
  };
}

export const getDailyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleSchema.parse(d))
  .handler(async ({ data }) => {
    const role = data.role as Role;
    const dateKey = getDateKeySaoPaulo();

    const { data: cached } = await supabaseAdmin
      .from("daily_messages")
      .select("frase,acao_titulo,acao_descricao")
      .eq("role", role)
      .eq("date_key", dateKey)
      .maybeSingle();

    if (cached) {
      return { frase: cached.frase, acaoTitulo: cached.acao_titulo, acaoDescricao: cached.acao_descricao, dateKey };
    }

    try {
      const gen = await generateFromAI(role);
      await supabaseAdmin
        .from("daily_messages")
        .upsert(
          { role, date_key: dateKey, frase: gen.frase, acao_titulo: gen.acao_titulo, acao_descricao: gen.acao_descricao },
          { onConflict: "role,date_key" },
        );
      return { frase: gen.frase, acaoTitulo: gen.acao_titulo, acaoDescricao: gen.acao_descricao, dateKey };
    } catch (e) {
      console.error("getDailyMessage falhou:", e);
      const fb: Record<Role, { frase: string; t: string; d: string }> = {
        corretor: {
          frase: "Toda venda começa com uma conversa. Faça a sua hoje.",
          t: "Reativar 5 leads frios",
          d: "Liste 5 contatos sem retorno há mais de 15 dias e envie uma mensagem nova com proposta de valor.",
        },
        gerente: {
          frase: "Liderança é multiplicar resultado pelo time, não pelo esforço próprio.",
          t: "1:1 rápido com 2 corretores",
          d: "Faça duas conversas de 15 minutos hoje: 1 ponto forte da semana, 1 bloqueio a destravar.",
        },
        diretor: {
          frase: "O número diz o que aconteceu. Sua decisão diz o que vai acontecer.",
          t: "Revisar KPI do funil semanal",
          d: "Compare conversão por etapa com a semana anterior e alinhe 1 hipótese de ação com a gerência.",
        },
      };
      const f = fb[role];
      return { frase: f.frase, acaoTitulo: f.t, acaoDescricao: f.d, dateKey };
    }
  });
