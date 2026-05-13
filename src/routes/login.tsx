import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Building2, Loader2, Mail, Lock, ArrowRight, ShieldCheck, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) nav({ to: "/" });
  }, [session, loading, nav]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) toast.error(error);
      else nav({ to: "/" });
    } finally {
      setSubmitting(false);
    }
  }

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

      <div className="min-h-screen grid lg:grid-cols-2">
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
              <div className="font-display font-semibold text-lg leading-none">Gestão Comercial</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1.5">
                Euro Empreendimentos
              </div>
            </div>
          </div>

          <div className="space-y-8 max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/40 backdrop-blur text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              Plataforma executiva 2026
            </div>
            <h2 className="font-display text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.05]">
              Inteligência comercial para
              <span
                className="block bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-primary)" }}
              >
                decisões precisas.
              </span>
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Acompanhe vendas, aprovações de crédito e a performance dos corretores em um único painel
              corporativo, com dados em tempo real.
            </p>

            <div className="grid grid-cols-1 gap-3 pt-2">
              {[
                { icon: TrendingUp, title: "Visão de portfólio", desc: "KPIs consolidados de vendas e funil." },
                { icon: ShieldCheck, title: "Aprovações de crédito", desc: "Status, condições e taxa de conversão." },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.5 }}
                  className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card/40 backdrop-blur"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <f.icon className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{f.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
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
              {/* top accent bar */}
              <div
                className="absolute top-0 left-8 right-8 h-px opacity-60"
                style={{ background: "var(--gradient-primary)" }}
              />

              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
                Área restrita
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Gestão Comercial</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Entre com suas credenciais corporativas para continuar.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5 mt-8">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                    E-mail
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
                      Entrar
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="flex items-center gap-2 mt-8 pt-6 border-t border-border/60 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                Conexão segura · Acesso somente para colaboradores autorizados.
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
