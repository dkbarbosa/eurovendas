import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyTeam, setTeamMember } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Loader2, UserPlus, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/equipe")({
  component: Page,
  beforeLoad: () => {
    // gating real é feito no _authenticated; aqui só ajudamos o crawl
    return;
  },
});

function Page() {
  const { isGerente, isAdmin } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listMyTeam);
  const setMember = useServerFn(setTeamMember);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: () => list(),
    enabled: isGerente || isAdmin,
  });

  const mut = useMutation({
    mutationFn: (v: { corretor_user_id: string; link: boolean }) => setMember({ data: v }),
    onSuccess: () => { toast.success("Equipe atualizada."); qc.invalidateQueries({ queryKey: ["my-team"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isGerente && !isAdmin) return <div className="text-muted-foreground">Acesso restrito.</div>;

  const team = rows.filter((r) => r.linked);
  const available = rows.filter((r) => !r.linked);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Gestão</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Minha Equipe</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vincule corretores à sua equipe para acompanhar performance e comissões.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando…</div>
      ) : (
        <>
          <Section title={`Minha equipe (${team.length})`} icon={<Users className="w-4 h-4" />}>
            {team.length === 0 ? (
              <Empty>Nenhum corretor vinculado ainda.</Empty>
            ) : (
              <TeamTable
                rows={team}
                actionLabel="Desvincular"
                actionIcon={<UserMinus className="w-4 h-4" />}
                onAct={(id) => mut.mutate({ corretor_user_id: id, link: false })}
                disabled={mut.isPending}
              />
            )}
          </Section>

          <Section title={`Disponíveis (${available.length})`} icon={<UserPlus className="w-4 h-4" />}>
            {available.length === 0 ? (
              <Empty>Todos os corretores já estão alocados.</Empty>
            ) : (
              <TeamTable
                rows={available}
                actionLabel="Adicionar"
                actionIcon={<UserPlus className="w-4 h-4" />}
                onAct={(id) => mut.mutate({ corretor_user_id: id, link: true })}
                disabled={mut.isPending}
                showOtherTeamFlag
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-6 text-sm text-muted-foreground">{children}</div>;
}

type Row = {
  user_id: string; email: string | null; display_name: string | null;
  corretor_nome: string | null; linked: boolean; in_other_team: boolean;
};

function TeamTable({
  rows, actionLabel, actionIcon, onAct, disabled, showOtherTeamFlag,
}: {
  rows: Row[]; actionLabel: string; actionIcon: React.ReactNode;
  onAct: (id: string) => void; disabled: boolean; showOtherTeamFlag?: boolean;
}) {
  return (
    <div className="glass-card p-2 overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">Nome</th>
            <th className="text-left p-3">E-mail</th>
            <th className="text-left p-3">Nome na planilha</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-t border-border">
              <td className="p-3 font-medium">{r.display_name ?? "—"}</td>
              <td className="p-3 text-muted-foreground">{r.email ?? "—"}</td>
              <td className="p-3">{r.corretor_nome ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="p-3 text-right">
                {showOtherTeamFlag && r.in_other_team && (
                  <span className="text-xs text-muted-foreground mr-3">em outra equipe</span>
                )}
                <Button size="sm" variant="outline" disabled={disabled || (showOtherTeamFlag && r.in_other_team)}
                  onClick={() => onAct(r.user_id)}>
                  {actionIcon}<span className="ml-2">{actionLabel}</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
