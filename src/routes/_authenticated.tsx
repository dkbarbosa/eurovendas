import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { canAccess, homeRouteFor } from "@/lib/route-access";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, rolesLoading, roles, isAdmin, isFinanceiro, isGerente, isCorretor, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const allowed = roles.length > 0;
  const caps = { isAdmin, isFinanceiro, isGerente, isCorretor };
  const routeOk = allowed && canAccess(loc.pathname, caps);

  useEffect(() => {
    if (!loading && !session) {
      nav({ to: "/login" });
      return;
    }
    // Redireciona usuário autenticado fora do escopo da role
    if (!loading && !rolesLoading && session && allowed && !routeOk) {
      const home = homeRouteFor(caps);
      if (home !== loc.pathname) nav({ to: home, replace: true });
    }
  }, [session, loading, rolesLoading, allowed, routeOk, loc.pathname, nav, caps]);

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

  if (!routeOk) {
    // useEffect já vai redirecionar; mostra spinner enquanto isso
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
