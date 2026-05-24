import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Building2, Loader2, Mail, Lock, ArrowRight, ShieldCheck, Sparkles,
  Crown, UserCog, Wallet, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { getCurrentUserContext } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type RoleKey = "admin" | "diretor" | "gerente" | "corretor" | "financeiro";

const ROLES: Array<{
  key: RoleKey;
  label: string;
  short: string;
  icon: typeof Crown;
  caption: string;
}> = [
  { key: "admin",      label: "Desenvolvedor", short: "Dev",        icon: Crown,   caption: "Controle total · mecanismo da empresa" },
  { key: "diretor",    label: "Diretoria",     short: "Diretoria",  icon: ShieldCheck, caption: "Visão completa · comissão sobre todas as vendas" },
  { key: "gerente",    label: "Gerencia",      short: "Gerencia",   icon: UserCog, caption: "Painel da equipe · metas e comissões" },
  { key: "corretor",   label: "Corretor",      short: "Corretor",   icon: Wallet,  caption: "Suas vendas e comissões em tempo real" },
  { key: "financeiro", label: "Financeiro",    short: "Financeiro", icon: Receipt, caption: "Pagamentos, NFs e distratos" },
];

function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [role, setRole] = useState<RoleKey>("admin");

  useEffect(() => {
    if (!loading && session) nav({ to: "/" });
  }, [session, loading, nav]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) { toast.error(error); return; }
      // Valida que a aba escolhida bate com uma role real do usuário
      try {
        const ctx = await getCurrentUserContext();
        const userRoles = (ctx.roles ?? []) as RoleKey[];
        if (!userRoles.includes(role)) {
          await supabase.auth.signOut();
          const labels = userRoles
            .map((r) => ROLES.find((x) => x.key === r)?.short ?? r)
            .join(", ") || "nenhum perfil";
          toast.error(
            `Acesso negado: este usuário não tem permissão de ${active.short}. Perfis disponíveis: ${labels}.`,
          );
          return;
        }
        nav({ to: "/" });
      } catch (err) {
        await supabase.auth.signOut();
        toast.error(err instanceof Error ? err.message : "Falha ao validar perfil.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const active = ROLES.find((r) => r.key === role)!;
  const ActiveIcon = active.icon;

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-background">
      {/* aurora background */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full blur-3xl opacity-30"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div
          className="absolute -bottom-48 -right-48 w-[700px] h-[700px] rounded-full blur-3xl opacity-25"
          style={{ background: "var(--gradient-gold)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:flex flex-col justify-between p-12 xl:p-16 relative"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl glow-primary flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-semibold text-lg leading-none">Euro Empreendimentos</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1.5">
                Sistema Premium · Topo de linha
              </div>
            </div>
          </div>

          <div className="space-y-8 max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/40 backdrop-blur text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              Plataforma exclusiva · 2026
            </div>
            <h2 className="font-display text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.05]">
              Informação e automação
              <span
                className="block bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-primary)" }}
              >
                em um só painel.
              </span>
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Cada perfil acessa o painel sincronizado com a planilha em tempo real —
              decisões precisas, comissões automatizadas e total controle do mecanismo da empresa.
            </p>

            {/* roles preview cards */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {ROLES.map((r, i) => {
                const Icon = r.icon;
                const isActive = r.key === role;
                return (
                  <motion.button
                    key={r.key}
                    type="button"
                    onClick={() => setRole(r.key)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.5 }}
                    className={`text-left p-4 rounded-xl border backdrop-blur transition-all ${
                      isActive
                        ? "border-primary/40 bg-card/70"
                        : "border-border/60 bg-card/30 hover:border-border hover:bg-card/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: isActive ? "var(--gradient-primary)" : "hsl(var(--secondary))" }}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? "text-primary-foreground" : "text-foreground"}`} />
                      </div>
                      <div className="font-medium text-sm">{r.short}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2 leading-snug">{r.caption}</div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Euro Empreendimentos · Acesso restrito
          </div>
        </motion.div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            <div className="glass-card p-8 sm:p-10 relative">
              <div
                className="absolute top-0 left-8 right-8 h-px opacity-60"
                style={{ background: "var(--gradient-primary)" }}
              />

              {/* role tabs */}
              <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-secondary/40 border border-border/60 mb-6">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const isActive = r.key === role;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRole(r.key)}
                      className={`relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-medium transition-colors ${
                        isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="login-role-pill"
                          className="absolute inset-0 rounded-lg"
                          style={{ background: "var(--gradient-primary)" }}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                        />
                      )}
                      <Icon className="w-3.5 h-3.5 relative z-10" />
                      <span className="relative z-10">{r.short}</span>
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={role}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
                    <ActiveIcon className="w-3.5 h-3.5" />
                    Acesso · {active.label}
                  </div>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">
                    Entrar na plataforma
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">{active.caption}.</p>
                </motion.div>
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-5 mt-7">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                    E-mail corporativo
                  </Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@euroempreendimentos.com.br"
                      className="pl-9 h-11"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="pw"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      className="pl-9 h-11"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 font-medium group"
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      Entrar como {active.short}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="flex items-center gap-2 mt-7 pt-6 border-t border-border/60 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                Conexão segura · Seu perfil é validado automaticamente após o login.
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
