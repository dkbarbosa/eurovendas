// Equipe House (corretores internos). Demais nomes são considerados parceiros
// (imobiliárias parceiras que enviam análise de crédito no mesmo canal).
export const HOUSE_TEAM = [
  "Elias",
  "David Duarte",
  "Jesuel",
  "Felipe",
  "Igor",
  "Samuel",
  "Tiago",
  "Alexsandro",
  "Ewelin Lais",
] as const;

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const HOUSE_SET = new Set(HOUSE_TEAM.map(norm));

export function isHouse(name?: string | null): boolean {
  if (!name) return false;
  const n = norm(name);
  if (HOUSE_SET.has(n)) return true;
  // match por primeiro nome para tolerar variações ("david", "elias gomes" etc.)
  const first = n.split(" ")[0];
  for (const h of HOUSE_SET) {
    if (h.split(" ")[0] === first) return true;
  }
  return false;
}

export type BrokerOrigin = "house" | "parceiro";
export function brokerOrigin(name?: string | null): BrokerOrigin {
  return isHouse(name) ? "house" : "parceiro";
}
