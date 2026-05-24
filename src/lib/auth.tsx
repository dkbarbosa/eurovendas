import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserContext } from "@/lib/auth.functions";

type Role = "admin" | "gerente" | "corretor" | "financeiro";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: Role[];
  isAdmin: boolean;
  isFinanceiro: boolean;
  isCorretor: boolean;
  isGerente: boolean;
  /** Capabilities semânticas. */
  canAdmin: boolean;       // só admin
  canManagement: boolean;  // admin OU gerente — vê área comercial
  canFinanceiro: boolean;  // admin OU financeiro — vê painel financeiro
  canCommissions: boolean; // admin, gerente OU corretor — vê suas comissões
  /** @deprecated mantido para compat — use canAdmin no lugar de isStaff. */
  isStaff: boolean;
  corretorNome: string | null;
  gerenteNome: string | null;
  loading: boolean;
  rolesLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [corretorNome, setCorretorNome] = useState<string | null>(null);
  const [gerenteNome, setGerenteNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      if (s?.user) {
        setRolesLoading(true);
        setTimeout(() => mounted && loadUserContext(), 0);
      } else {
        setRoles([]);
        setCorretorNome(null);
        setGerenteNome(null);
        setRolesLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        setRolesLoading(true);
        loadUserContext();
      } else {
        setRolesLoading(false);
      }
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadUserContext() {
    try {
      const context = await getCurrentUserContext();
      setRoles(context.roles as Role[]);
      setCorretorNome(context.corretorNome);
      setGerenteNome(context.gerenteNome);
    } catch (e) {
      console.error("loadUserContext failed:", e);
      setRoles([]);
      setCorretorNome(null);
      setGerenteNome(null);
    } finally {
      setRolesLoading(false);
    }
  }

  const isAdmin = roles.includes("admin");
  const isFinanceiro = roles.includes("financeiro");
  const isCorretor = roles.includes("corretor");
  const isGerente = roles.includes("gerente");

  const canAdmin = isAdmin;
  const canManagement = isAdmin || isGerente;
  const canFinanceiro = isAdmin || isFinanceiro;
  const canCommissions = isAdmin || isGerente || isCorretor;

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    isAdmin,
    isFinanceiro,
    isCorretor,
    isGerente,
    canAdmin,
    canManagement,
    canFinanceiro,
    canCommissions,
    isStaff: isAdmin, // compat: "staff" agora é admin-only (financeiro perdeu acesso à área comercial)
    corretorNome,
    gerenteNome,
    loading,
    rolesLoading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signUp: async (email, password, displayName) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { display_name: displayName },
        },
      });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/**
 * Retorna a rota "home" permitida para o usuário com base na role mais privilegiada.
 * Usado por beforeLoad guards para redirecionar quando o usuário tenta acessar
 * uma área que não pode ver.
 */
export function homeRouteForRoles(roles: string[]): string {
  if (roles.includes("admin")) return "/";
  if (roles.includes("gerente")) return "/gerentes";
  if (roles.includes("financeiro")) return "/financeiro";
  if (roles.includes("corretor")) return "/comissoes";
  return "/login";
}
