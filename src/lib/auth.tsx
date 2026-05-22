import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserContext } from "@/lib/auth.functions";

type Role = "admin" | "diretor" | "gerente" | "corretor" | "financeiro";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: Role[];
  isAdmin: boolean;
  isDiretor: boolean;
  isFinanceiro: boolean;
  isCorretor: boolean;
  isGerente: boolean;
  isStaff: boolean; // admin OR diretor OR financeiro
  corretorNome: string | null;
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
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      // Ignora eventos que não mudam o usuário (refresh de token ao voltar para a aba)
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      if (s?.user) {
        setRolesLoading(true);
        // Defer para evitar deadlock dentro do callback de auth
        setTimeout(() => mounted && loadUserContext(s.user.id), 0);
      } else {
        setRoles([]);
        setCorretorNome(null);
        setRolesLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        setRolesLoading(true);
        loadUserContext(data.session.user.id);
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

  async function loadUserContext(userId: string) {
    try {
      const context = await getCurrentUserContext();
      setRoles(context.roles);
      setCorretorNome(context.corretorNome);
    } catch (e) {
      console.error("loadUserContext failed:", e);
      setRoles([]);
      setCorretorNome(null);
    } finally {
      setRolesLoading(false);
    }
  }

  const isAdmin = roles.includes("admin");
  const isDiretor = roles.includes("diretor");
  const isFinanceiro = roles.includes("financeiro");
  const isCorretor = roles.includes("corretor");
  const isGerente = roles.includes("gerente");

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    isAdmin,
    isDiretor,
    isFinanceiro,
    isCorretor,
    isGerente,
    isStaff: isAdmin || isDiretor || isFinanceiro,
    corretorNome,
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
