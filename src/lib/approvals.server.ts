// Server-only: importa o JSON com PII e nunca é enviado ao cliente.
import data from "../data-server/approvals.json";
import type { Approval } from "@/components/aprovacoes/types";

export function readApprovals(): Approval[] {
  return data as Approval[];
}
