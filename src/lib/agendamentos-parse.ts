import { HOUSE_TEAM, isHouse, type BrokerOrigin } from "./team";

// Gestor — não conta como corretor mas aparece em quase todo título
const GESTOR_NAMES = ["maicon"];

// Mapa email -> corretor (quando criador do evento é conhecido)
const EMAIL_TO_BROKER: Record<string, string> = {
  "davidduartee10@gmail.com": "David Duarte",
  "felipesilva9153@gmail.com": "Felipe",
};

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const HOUSE_FIRST_NAMES = HOUSE_TEAM.map((n) => norm(n).split(" ")[0]);

export interface ParsedAgendamento {
  broker: string | null;
  origin: BrokerOrigin | "desconhecido";
  cliente: string | null;
}

/** Extrai corretor e cliente do título / descrição / criador. */
export function parseAgendamento(
  summary: string,
  description?: string | null,
  creatorEmail?: string | null,
  knownBrokers: string[] = [],
): ParsedAgendamento {
  const text = `${summary ?? ""} ${description ?? ""}`;
  const t = norm(text);

  // 1) Match com nomes da House (primeiro nome)
  for (let i = 0; i < HOUSE_FIRST_NAMES.length; i += 1) {
    const fn = HOUSE_FIRST_NAMES[i];
    if (!fn) continue;
    const re = new RegExp(`\\b${fn}\\b`, "i");
    if (re.test(t)) {
      return { broker: HOUSE_TEAM[i], origin: "house", cliente: extractCliente(summary) };
    }
  }

  // 2) Match com corretores conhecidos (vindos da tabela de vendas — parceiros)
  for (const name of knownBrokers) {
    const first = norm(name).split(" ")[0];
    if (!first || first.length < 3) continue;
    if (GESTOR_NAMES.includes(first)) continue;
    const re = new RegExp(`\\b${first}\\b`, "i");
    if (re.test(t)) {
      return {
        broker: name,
        origin: isHouse(name) ? "house" : "parceiro",
        cliente: extractCliente(summary),
      };
    }
  }

  // 3) Fallback: email do criador
  if (creatorEmail && EMAIL_TO_BROKER[creatorEmail]) {
    const b = EMAIL_TO_BROKER[creatorEmail];
    return { broker: b, origin: isHouse(b) ? "house" : "parceiro", cliente: extractCliente(summary) };
  }

  return { broker: null, origin: "desconhecido", cliente: extractCliente(summary) };
}

function extractCliente(summary: string): string | null {
  if (!summary) return null;
  // "Cliente: NOME - ..." ou "Cliente NOME"
  const m = summary.match(/cliente\s*:?\s*([^-/–]+)/i);
  if (m) return m[1].trim();
  return summary.split(/[-–]/)[0].trim() || null;
}
