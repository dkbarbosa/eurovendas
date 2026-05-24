import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUsers, inviteUser, setUserRole, deleteUser, adminChangeUserPassword, adminUpdateUserProfile } from "@/lib/users.functions";
import { listBrokerMappings, setBrokerMapping } from "@/lib/broker-mapping.functions";
import { adminSetCorretorGerente } from "@/lib/team.functions";
import { listDistinctCorretores } from "@/lib/commissions.functions";
import { listDistinctGerentes } from "@/lib/gerente.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { Loader2, Trash2, UserPlus, Link2, KeyRound, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

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
  const listGerentesSheet = useServerFn(listDistinctGerentes);
  const changePw = useServerFn(adminChangeUserPassword);
  const updateProfile = useServerFn(adminUpdateUserProfile);
  const setCorretorGer = useServerFn(adminSetCorretorGerente);

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => list({}), enabled: isAdmin });
  const { data: maps = [] } = useQuery({ queryKey: ["broker-mappings"], queryFn: () => listMaps(), enabled: isAdmin });
  const { data: brokers = [] } = useQuery({ queryKey: ["distinct-corretores"], queryFn: () => listBrokers(), enabled: isAdmin });
  const { data: gerentesSheet = [] } = useQuery({ queryKey: ["distinct-gerentes"], queryFn: () => listGerentesSheet(), enabled: isAdmin });

  const mapByUser = useMemo(() => new Map(maps.map((m) => [m.user_id, m])), [maps]);
  const gerentes = useMemo(() => users.filter((u) => u.roles.includes("gerente")), [users]);

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
    mutationFn: (v: { user_id: string; corretor_nome: string | null; gerente_nome?: string | null }) => setMap({ data: v }),
    onSuccess: () => { toast.success("Vínculo atualizado."); qc.invalidateQueries({ queryKey: ["broker-mappings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const teamMut = useMutation({
    mutationFn: (v: { corretor_user_id: string; gerente_user_id: string | null }) => setCorretorGer({ data: v }),
    onSuccess: () => { toast.success("Equipe do corretor atualizada."); qc.invalidateQueries({ queryKey: ["broker-mappings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return <div className="text-muted-foreground">Acesso restrito.</div>;

  return (
    <div className="max-w-7xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Administração</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vincule cada corretor ao nome da planilha e, opcionalmente, a um gerente responsável.
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
            className="h-9 w-full rounded-md bg-input border border-border px-3 text-sm text-foreground">
            {ROLES.map((r) => <option key={r} value={r} className="bg-background text-foreground">{r}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={inviteMut.isPending} style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
          {inviteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-2" />Criar</>}
        </Button>
      </form>

      <div className="glass-card p-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">E-mail</th>
              <th className="text-left p-3">Papéis</th>
              <th className="text-left p-3"><Link2 className="w-3 h-3 inline mr-1" />Corretor (planilha)</th>
              <th className="text-left p-3"><Link2 className="w-3 h-3 inline mr-1" />Gerente (planilha)</th>
              <th className="text-left p-3">Gerente responsável</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const map = mapByUser.get(u.id);
              const current = map?.corretor_nome ?? "";
              const currentGer = map?.gerente_nome ?? "";
              const currentTeam = map?.team_gerente_user_id ?? "";
              const isCorretor = u.roles.includes("corretor");
              const isGer = u.roles.includes("gerente");
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
                      onChange={(e) => mapMut.mutate({ user_id: u.id, corretor_nome: e.target.value || null, gerente_nome: currentGer || null })}
                      className="h-9 w-full max-w-[220px] rounded-md bg-background text-foreground border border-border px-2 text-sm"
                    >
                      <option value="" className="bg-background text-foreground">— sem vínculo —</option>
                      {brokers.map((b) => (
                        <option key={b} value={b} className="bg-background text-foreground">{b}</option>
                      ))}
                      {current && !brokers.includes(current) && (
                        <option value={current} className="bg-background text-foreground">{current} (planilha)</option>
                      )}
                    </select>
                  </td>
                  <td className="p-3">
                    {isGer ? (
                      <select
                        value={currentGer}
                        onChange={(e) => mapMut.mutate({ user_id: u.id, corretor_nome: current || null, gerente_nome: e.target.value || null })}
                        className="h-9 w-full max-w-[220px] rounded-md bg-background text-foreground border border-border px-2 text-sm"
                      >
                        <option value="" className="bg-background text-foreground">— sem vínculo —</option>
                        {gerentesSheet.map((g) => (
                          <option key={g} value={g} className="bg-background text-foreground">{g}</option>
                        ))}
                        {currentGer && !gerentesSheet.includes(currentGer) && (
                          <option value={currentGer} className="bg-background text-foreground">{currentGer} (planilha)</option>
                        )}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isCorretor ? (
                      <select
                        value={currentTeam}
                        onChange={(e) => teamMut.mutate({ corretor_user_id: u.id, gerente_user_id: e.target.value || null })}
                        className="h-9 w-full max-w-[220px] rounded-md bg-background text-foreground border border-border px-2 text-sm"
                      >
                        <option value="" className="bg-background text-foreground">— sem gerente —</option>
                        {gerentes.map((g) => (
                          <option key={g.id} value={g.id} className="bg-background text-foreground">
                            {g.display_name ?? g.email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <EditProfileButton
                        userId={u.id}
                        currentName={u.display_name ?? ""}
                        currentEmail={u.email ?? ""}
                        updateProfile={updateProfile}
                      />
                      <ChangePasswordButton userId={u.id} userLabel={u.display_name ?? u.email ?? ""} changePw={changePw} />
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover usuário?")) delMut.mutate(u.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
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

function ChangePasswordButton({
  userId, userLabel, changePw,
}: {
  userId: string; userLabel: string;
  changePw: (args: { data: { userId: string; password: string } }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const mut = useMutation({
    mutationFn: () => changePw({ data: { userId, password: pw } }),
    onSuccess: () => { toast.success(`Senha de ${userLabel} alterada.`); setPw(""); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Alterar senha">
          <KeyRound className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar senha — {userLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">A nova senha vale imediatamente. Sem envio de e-mail.</p>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={mut.isPending || pw.length < 8} onClick={() => mut.mutate()}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProfileButton({
  userId, currentName, currentEmail, updateProfile,
}: {
  userId: string; currentName: string; currentEmail: string;
  updateProfile: (args: { data: { userId: string; email: string; displayName: string } }) => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail);
  const mut = useMutation({
    mutationFn: () => updateProfile({ data: { userId, email, displayName: name } }),
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setName(currentName); setEmail(currentEmail); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Editar nome e e-mail">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">A alteração vale imediatamente. Sem envio de e-mail de confirmação.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={mut.isPending || !name.trim() || !email.trim()} onClick={() => mut.mutate()}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
