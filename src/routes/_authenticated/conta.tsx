import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { changeOwnPassword } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/conta")({ component: Page });

function Page() {
  const { user, roles, corretorNome, gerenteNome } = useAuth();
  const changePw = useServerFn(changeOwnPassword);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const mut = useMutation({
    mutationFn: () => changePw({ data: { password: pw } }),
    onSuccess: () => { toast.success("Senha alterada com sucesso."); setPw(""); setPw2(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { toast.error("Mínimo 8 caracteres."); return; }
    if (pw !== pw2) { toast.error("As senhas não coincidem."); return; }
    mut.mutate();
  };

  const displayName = (user?.user_metadata?.display_name as string) ?? user?.email ?? "—";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Conta</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Minha Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">Seus dados e segurança da conta.</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserIcon className="w-4 h-4" /> Meus dados
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Nome" value={displayName} />
          <Field label="E-mail" value={user?.email ?? "—"} />
          <Field label="Papéis" value={roles.length ? roles.join(", ") : "—"} />
          {corretorNome && <Field label="Nome na planilha (corretor)" value={corretorNome} />}
          {gerenteNome && <Field label="Nome na planilha (gerente)" value={gerenteNome} />}
        </dl>
      </div>

      <form onSubmit={submit} className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="w-4 h-4" /> Alterar senha
        </div>
        <p className="text-xs text-muted-foreground">Sem envio de e-mail — a nova senha vale imediatamente.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar senha</Label>
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required />
          </div>
        </div>
        <Button type="submit" disabled={mut.isPending}
          style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar nova senha"}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
