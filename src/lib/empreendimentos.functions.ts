import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/notion/v1";

const SOURCES: { id: string; empreendimento: string }[] = [
  { id: "27f8f43b-99e0-8026-a518-dc525ed0f29a", empreendimento: "Residencial Magnific Towers" },
  { id: "27f8f43b-99e0-81c9-af52-f7b3d1bed6e2", empreendimento: "Residencial Napoli" },
  { id: "26a8f43b-99e0-8081-b249-d1ac0af39cfe", empreendimento: "Residencial Magic Tower" },
];

export interface UnidadeDisponivel {
  id: string;
  empreendimento: string;
  unidade: string;
  torre: string | null;
  andar: string | null;
  tipo: string | null;
  orientacao: string | null;
  areaAp: string | null;
  areaPrivTotal: string | null;
  areaVg: string | null;
  areaDesc: string | null;
  vg: string | null;
  vgNumero: string | null;
  valorVenda: number | null;
  valorAvaliacao: number | null;
  situacao: string | null;
  notionUrl: string;
}

function plain(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "rich_text") {
    const t = (prop.rich_text ?? []).map((r: any) => r.plain_text).join("").trim();
    return t || null;
  }
  if (prop.type === "title") {
    const t = (prop.title ?? []).map((r: any) => r.plain_text).join("").trim();
    return t || null;
  }
  if (prop.type === "select") return prop.select?.name ?? null;
  return null;
}
function num(prop: any): number | null {
  if (!prop) return null;
  if (prop.type === "number") return typeof prop.number === "number" ? prop.number : null;
  if (prop.type === "formula" && prop.formula?.type === "number") return prop.formula.number ?? null;
  return null;
}

async function queryAll(databaseId: string): Promise<any[]> {
  const lovable = process.env.LOVABLE_API_KEY;
  const notion = process.env.NOTION_API_KEY;
  if (!lovable || !notion) throw new Error("Notion não configurado.");
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${GATEWAY}/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": notion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
    out.push(...(json.results ?? []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return out;
}

export const listUnidadesDisponiveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ items: UnidadeDisponivel[]; updatedAt: string }> => {
    const all = await Promise.all(
      SOURCES.map(async (src) => {
        try {
          const pages = await queryAll(src.id);
          return pages
            .map<UnidadeDisponivel | null>((p) => {
              const props = p.properties ?? {};
              const comprador = plain(props["Comprador"]);
              if (comprador) return null; // VENDIDA → oculta
              const unidade = plain(props["Unid."]);
              if (!unidade) return null;
              return {
                id: p.id,
                empreendimento: src.empreendimento,
                unidade,
                torre: plain(props["Torre"]),
                andar: plain(props["And./Pav."]),
                tipo: plain(props["Tipo"]),
                orientacao: plain(props["Orientação Solar"]),
                areaAp: plain(props["Área AP"]),
                areaPrivTotal: plain(props["Área Priv. Total"]),
                areaVg: plain(props["Área Vg"]),
                areaDesc: plain(props["Área Desc."]),
                vg: plain(props["Vg"]),
                vgNumero: plain(props["Vg nº"]),
                valorVenda: num(props["Valor de Venda"]),
                valorAvaliacao: num(props["Valor Avaliação"]),
                situacao: plain(props["Situação"]),
                notionUrl: p.url ?? "",
              };
            })
            .filter((x): x is UnidadeDisponivel => x !== null);
        } catch (e) {
          console.error(`Falha ao ler ${src.empreendimento}:`, e);
          return [];
        }
      }),
    );
    return { items: all.flat(), updatedAt: new Date().toISOString() };
  });
