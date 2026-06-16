import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "corretor" | "gerente" | "diretor";

const RoleSchema = z.object({ role: z.enum(["corretor", "gerente", "diretor"]) });

const PROMPTS: Record<Role, { sistema: string; usuario: string }> = {
  corretor: {
    sistema:
      "Você é um curador de citações de livros para corretores de imóveis no Brasil. Sempre cite frases REAIS de autores reconhecidos (preferência: vendas, persuasão, alta performance, mentalidade — ex.: Zig Ziglar, Jordan Belfort, Grant Cardone, Brian Tracy, Napoleon Hill, Augusto Cury, Flávio Augusto, Geraldo Rufino, Daniel Pink).",
    usuario:
      "Escolha para HOJE uma citação REAL e curta (máx. 22 palavras) de um autor de livro famoso, ligada a vendas/persuasão/mentalidade — útil para um corretor de imóveis. Em seguida, gere uma ação prática do dia (30-60 min): follow-up estruturado, prospecção fria, estudo de objeção ou técnica de fechamento. Varie autores e temas a cada dia.",
  },
  gerente: {
    sistema:
      "Você é um curador de citações de livros para líderes comerciais no mercado imobiliário brasileiro. Sempre cite frases REAIS de autores reconhecidos em liderança e gestão (ex.: Simon Sinek, John Maxwell, Patrick Lencioni, Jim Collins, Vicente Falconi, Marshall Goldsmith, Peter Drucker).",
    usuario:
      "Escolha para HOJE uma citação REAL e curta (máx. 22 palavras) de um autor de livro famoso de liderança/gestão, útil para um gerente de equipe de corretores. Em seguida, gere uma ação prática do dia (1:1 com corretor, revisão de funil, coaching de objeção, ritual de time).",
  },
  diretor: {
    sistema:
      "Você é um curador de citações de livros para diretores comerciais de incorporadoras brasileiras. Sempre cite frases REAIS de autores reconhecidos em estratégia e negócios (ex.: Peter Drucker, Jim Collins, Michael Porter, Ray Dalio, Clayton Christensen, Vicente Falconi, Nassim Taleb).",
    usuario:
      "Escolha para HOJE uma citação REAL e curta (máx. 22 palavras) de um autor de livro famoso de estratégia/negócios, útil para um diretor comercial. Em seguida, gere uma ação prática do dia (análise de KPI, conversa com gerência, leitura de mercado, decisão de portfólio).",
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

async function generateFromAI(
  role: Role,
  dateKey: string,
  avoid: { autores: string[]; frases: string[] },
): Promise<{ frase: string; autor: string; acao_titulo: string; acao_descricao: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente.");
  const p = PROMPTS[role];

  const avoidAutores = avoid.autores.length ? avoid.autores.join("; ") : "(nenhum)";
  const avoidFrases = avoid.frases.length ? avoid.frases.map((f) => `"${f}"`).join(" | ") : "(nenhuma)";

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
            `\n\nData de hoje: ${dateKey}. Gere conteúdo NOVO e DIFERENTE para hoje.` +
            `\nNÃO repita os autores recentes: ${avoidAutores}.` +
            `\nNÃO repita nem parafraseie estas frases recentes: ${avoidFrases}.` +
            '\n\nResponda APENAS em JSON estrito no formato: {"frase":"...","autor":"Nome do Autor","acao_titulo":"...","acao_descricao":"..."}. ' +
            "frase: citação REAL do autor (sem inventar). autor: nome completo do autor da citação. acao_titulo: 3-7 palavras. acao_descricao: 1-2 frases, no máximo 35 palavras. Sem emojis. Sem aspas extras dentro dos campos. " +
            "REGRAS DE PORTUGUÊS (OBRIGATÓRIO): use português do Brasil impecável, com acentuação completa (á, ã, ç, ê, õ, ú), pontuação correta (vírgulas, ponto final no fim de cada frase), concordância verbal e nominal corretas, sem erros de digitação, sem espaços duplos, sem caracteres estranhos. Revise antes de responder.",
        },
      ],
      response_format: { type: "json_object" },
      temperature: 1.1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: { choices?: { message?: { content?: string } }[] } = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content);
  if (!parsed.frase || !parsed.autor || !parsed.acao_titulo || !parsed.acao_descricao) {
    throw new Error("Resposta da IA incompleta (autor obrigatório).");
  }
  return {
    frase: String(parsed.frase).trim(),
    autor: String(parsed.autor ?? "").trim(),
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
      .select("frase,autor,acao_titulo,acao_descricao")
      .eq("role", role)
      .eq("date_key", dateKey)
      .maybeSingle();

    if (cached) {
      return {
        frase: cached.frase,
        autor: cached.autor ?? "",
        acaoTitulo: cached.acao_titulo,
        acaoDescricao: cached.acao_descricao,
        dateKey,
      };
    }

    try {
      const gen = await generateFromAI(role);
      await supabaseAdmin
        .from("daily_messages")
        .upsert(
          {
            role,
            date_key: dateKey,
            frase: gen.frase,
            autor: gen.autor || null,
            acao_titulo: gen.acao_titulo,
            acao_descricao: gen.acao_descricao,
          },
          { onConflict: "role,date_key" },
        );
      return {
        frase: gen.frase,
        autor: gen.autor,
        acaoTitulo: gen.acao_titulo,
        acaoDescricao: gen.acao_descricao,
        dateKey,
      };
    } catch (e) {
      console.error("getDailyMessage falhou:", e);
      const fb: Record<Role, { frase: string; autor: string; t: string; d: string }> = {
        corretor: {
          frase: "Pessoas não compram por razões lógicas. Elas compram por razões emocionais.",
          autor: "Zig Ziglar",
          t: "Reativar 5 leads frios",
          d: "Liste 5 contatos sem retorno há mais de 15 dias e envie uma mensagem nova com proposta de valor.",
        },
        gerente: {
          frase: "Líderes excepcionais saem do seu caminho para aumentar a autoestima do seu pessoal.",
          autor: "Sam Walton",
          t: "1:1 rápido com 2 corretores",
          d: "Faça duas conversas de 15 minutos hoje: 1 ponto forte da semana, 1 bloqueio a destravar.",
        },
        diretor: {
          frase: "A melhor maneira de prever o futuro é criá-lo.",
          autor: "Peter Drucker",
          t: "Revisar KPI do funil semanal",
          d: "Compare conversão por etapa com a semana anterior e alinhe 1 hipótese de ação com a gerência.",
        },
      };
      const f = fb[role];
      return { frase: f.frase, autor: f.autor, acaoTitulo: f.t, acaoDescricao: f.d, dateKey };
    }
  });
