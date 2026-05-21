import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, rolesLoading, roles, signOut } = useAuth();
  const nav = useNavigate();
  // Qualquer role autenticada com pelo menos 1 role atribuída
  const allowed = roles.length > 0;

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [session, loading, nav]);

  if (loading || !session || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="font-display text-xl font-semibold">Sem permissão</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta ainda não tem nenhum perfil atribuído. Fale com o administrador.
          </p>
          <Button onClick={() => signOut().then(() => nav({ to: "/login" }))} className="w-full">
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
