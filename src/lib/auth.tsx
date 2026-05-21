import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setRolesLoading(true);
        setTimeout(() => loadUserContext(s.user.id), 0);
      } else {
        setRoles([]);
        setCorretorNome(null);
        setRolesLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        setRolesLoading(true);
        loadUserContext(data.session.user.id);
      } else {
        setRolesLoading(false);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadUserContext(userId: string) {
    const [{ data: rData }, { data: mData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("broker_mapping").select("corretor_nome,ativo").eq("user_id", userId).maybeSingle(),
    ]);
    setRoles((rData ?? []).map((r) => r.role as Role));
    setCorretorNome(mData?.ativo ? mData.corretor_nome : null);
    setRolesLoading(false);
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
