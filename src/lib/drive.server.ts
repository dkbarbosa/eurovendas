// Helpers para Google Drive via Connector Gateway.
// SERVIDOR ONLY (usa LOVABLE_API_KEY + GOOGLE_DRIVE_API_KEY).

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const UPLOAD_BASE = `${GATEWAY}/upload/drive/v3`;
const API_BASE = `${GATEWAY}/drive/v3`;

// Pasta-alvo no Google Drive onde as NFs serão arquivadas.
export const NF_DRIVE_FOLDER_ID = "1QLl4d5AZdf-nW1NlLNffg8v5RrbLqC_7";

function authHeaders() {
  const lk = process.env.LOVABLE_API_KEY;
  const dk = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY não configurada.");
  if (!dk) throw new Error("Google Drive não está conectado.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk };
}

export async function getOrCreateDriveFolder(name: string, parentId: string = NF_DRIVE_FOLDER_ID): Promise<string> {
  const safe = name.replace(/['\\]/g, " ").trim() || "sem-nome";
  const q = encodeURIComponent(
    `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '${safe}'`,
  );
  const findRes = await fetch(`${API_BASE}/files?q=${q}&fields=files(id,name)&pageSize=1`, { headers: authHeaders() });
  const found = (await findRes.json()) as { files?: Array<{ id: string }>; error?: { message?: string } };
  if (findRes.ok && found.files && found.files.length > 0) return found.files[0].id;

  const createRes = await fetch(`${API_BASE}/files?fields=id`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: safe, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const created = (await createRes.json()) as { id?: string; error?: { message?: string } };
  if (!createRes.ok || !created.id) {
    throw new Error(`Drive criar pasta falhou [${createRes.status}]: ${created?.error?.message ?? ""}`);
  }
  return created.id;
}

// Tipos fixos de subpasta por corretor
export type CorretorDocTipo = "NF" | "Promissórias" | "Contratos" | "Documentos Pessoais" | "Outros";

// Subpastas que organizam por Empreendimento → Cliente
const NESTED_TIPOS: ReadonlySet<CorretorDocTipo> = new Set(["NF", "Promissórias", "Contratos"]);

function sanitizeSegment(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "sem-nome";
}

/**
 * Garante a árvore de pastas no Drive para um corretor e retorna o folderId final.
 *
 * Estrutura:
 *   📁 NFs (raiz)
 *      └── 📁 {Corretor}
 *           ├── 📁 NF                  → /{Empreendimento}/{Cliente}
 *           ├── 📁 Promissórias        → /{Empreendimento}/{Cliente}
 *           ├── 📁 Contratos           → /{Empreendimento}/{Cliente}
 *           ├── 📁 Documentos Pessoais
 *           └── 📁 Outros
 *
 * É idempotente: reutiliza pastas existentes com mesmo nome (não duplica).
 */
export async function getCorretorDocFolder(opts: {
  corretor: string;
  tipo: CorretorDocTipo;
  empreendimento?: string | null;
  cliente?: string | null;
}): Promise<string> {
  const corretorFolder = await getOrCreateDriveFolder(sanitizeSegment(opts.corretor), NF_DRIVE_FOLDER_ID);
  const tipoFolder = await getOrCreateDriveFolder(opts.tipo, corretorFolder);
  if (!NESTED_TIPOS.has(opts.tipo)) return tipoFolder;
  if (!opts.empreendimento) return tipoFolder;
  const empFolder = await getOrCreateDriveFolder(sanitizeSegment(opts.empreendimento), tipoFolder);
  if (!opts.cliente) return empFolder;
  return getOrCreateDriveFolder(sanitizeSegment(opts.cliente), empFolder);
}

export async function uploadFileToDriveFolder(opts: {
  buffer: Uint8Array;
  filename: string;
  mimeType: string;
  folderId?: string;
}): Promise<{ id: string; webViewLink: string }> {
  const folderId = opts.folderId ?? NF_DRIVE_FOLDER_ID;
  const metadata = { name: opts.filename, parents: [folderId] };

  const boundary = `lovable-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + opts.buffer.length + tail.length);
  body.set(head, 0);
  body.set(opts.buffer, head.length);
  body.set(tail, head.length + opts.buffer.length);

  const res = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = (await res.json()) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(`Drive upload falhou [${res.status}]: ${data?.error?.message ?? JSON.stringify(data)}`);
  }
  return { id: data.id, webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view` };
}

export async function downloadDriveFile(fileId: string): Promise<{ buffer: Uint8Array; contentType: string; filename: string }> {
  // Metadata
  const metaRes = await fetch(`${API_BASE}/files/${fileId}?fields=name,mimeType`, { headers: authHeaders() });
  const meta = (await metaRes.json()) as { name?: string; mimeType?: string; error?: { message?: string } };
  if (!metaRes.ok) throw new Error(`Drive metadata falhou [${metaRes.status}]: ${meta?.error?.message ?? ""}`);
  // Conteúdo
  const cRes = await fetch(`${API_BASE}/files/${fileId}?alt=media`, { headers: authHeaders() });
  if (!cRes.ok) {
    const txt = await cRes.text();
    throw new Error(`Drive download falhou [${cRes.status}]: ${txt}`);
  }
  const ab = await cRes.arrayBuffer();
  return {
    buffer: new Uint8Array(ab),
    contentType: meta.mimeType ?? "application/octet-stream",
    filename: meta.name ?? `arquivo-${fileId}`,
  };
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/files/${fileId}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Drive delete falhou [${res.status}]: ${txt}`);
  }
}

export async function listOldFilesInFolder(folderId: string, olderThanDays: number): Promise<Array<{ id: string; name: string }>> {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and createdTime < '${cutoff}'`);
  const url = `${API_BASE}/files?q=${q}&fields=files(id,name)&pageSize=1000`;
  const res = await fetch(url, { headers: authHeaders() });
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }>; error?: { message?: string } };
  if (!res.ok) throw new Error(`Drive list falhou [${res.status}]: ${data?.error?.message ?? ""}`);
  return data.files ?? [];
}
