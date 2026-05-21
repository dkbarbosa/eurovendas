import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUsers, inviteUser, setUserRole, deleteUser } from "@/lib/users.functions";
import { listBrokerMappings, setBrokerMapping } from "@/lib/broker-mapping.functions";
import { listDistinctCorretores } from "@/lib/commissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { Loader2, Trash2, UserPlus, Link2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({ component: Page });

const ROLES = ["admin", "diretor", "gerente", "corretor", "financeiro"] as const;
type Role = typeof ROLES[number];

function Page() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const invite = useServerFn(inviteUser);
  const setRole = useServerFn(setUserRole);
  const del = useServerFn(deleteUser);
  const listMaps = useServerFn(listBrokerMappings);
  const setMap = useServerFn(setBrokerMapping);
  const listBrokers = useServerFn(listDistinctCorretores);

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => list({}), enabled: isAdmin });
  const { data: maps = [] } = useQuery({ queryKey: ["broker-mappings"], queryFn: () => listMaps(), enabled: isAdmin });
  const { data: brokers = [] } = useQuery({ queryKey: ["distinct-corretores"], queryFn: () => listBrokers(), enabled: isAdmin });

  const mapByUser = useMemo(() => new Map(maps.map((m) => [m.user_id, m])), [maps]);

  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "corretor" as Role });
  const inviteMut = useMutation({
    mutationFn: () => invite({ data: form }),
    onSuccess: () => { toast.success("Usuário criado."); setForm({ email: "", password: "", displayName: "", role: "corretor" }); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: Role; enable: boolean }) => setRole({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (userId: string) => del({ data: { userId } }),
    onSuccess: () => { toast.success("Removido."); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mapMut = useMutation({
    mutationFn: (v: { user_id: string; corretor_nome: string | null }) => setMap({ data: v }),
    onSuccess: () => { toast.success("Vínculo atualizado."); qc.invalidateQueries({ queryKey: ["broker-mappings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return <div className="text-muted-foreground">Acesso restrito.</div>;

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Administração</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vincule cada corretor ao nome exato que aparece na planilha — sem isso, comissões e NF não aparecem para ele.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); inviteMut.mutate(); }}
        className="glass-card p-6 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <div className="space-y-1.5"><Label>Nome</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></div>
        <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
        <div className="space-y-1.5"><Label>Senha</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></div>
        <div className="space-y-1.5">
          <Label>Papel</Label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            className="h-9 w-full rounded-md bg-input border border-border px-3 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={inviteMut.isPending} style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
          {inviteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-2" />Criar</>}
        </Button>
      </form>

      <div className="glass-card p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">E-mail</th>
              <th className="text-left p-3">Papéis</th>
              <th className="text-left p-3"><Link2 className="w-3 h-3 inline mr-1" />Vínculo Corretor (planilha)</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const map = mapByUser.get(u.id);
              const current = map?.corretor_nome ?? "";
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-3 font-medium">{u.display_name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES.map((r) => {
                        const active = u.roles.includes(r);
                        return (
                          <button key={r} onClick={() => roleMut.mutate({ userId: u.id, role: r, enable: !active })}
                            className={`px-2 py-0.5 text-xs rounded-full border transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-3">
                    <select
                      value={current}
                      onChange={(e) => mapMut.mutate({ user_id: u.id, corretor_nome: e.target.value || null })}
                      className="h-9 w-full max-w-[260px] rounded-md bg-input border border-border px-2 text-sm"
                    >
                      <option value="">— sem vínculo —</option>
                      {brokers.map((b) => <option key={b} value={b}>{b}</option>)}
                      {current && !brokers.includes(current) && <option value={current}>{current} (planilha)</option>}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover usuário?")) delMut.mutate(u.id); }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
