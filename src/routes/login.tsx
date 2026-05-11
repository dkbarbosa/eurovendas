import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp, session, loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) nav({ to: "/" });
  }, [session, loading, nav]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) toast.error(error);
        else nav({ to: "/" });
      } else {
        const { error } = await signUp(email, password, displayName);
        if (error) toast.error(error);
        else {
          toast.success("Conta criada. Faça login.");
          setMode("signin");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* aurora background */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-30"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl opacity-25"
          style={{ background: "var(--gradient-gold)" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md glass-card p-8"
      >
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-11 h-11 rounded-xl glow-primary flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display font-semibold text-lg leading-none">VGV Analytics</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1.5">
              Equipe Maicon
            </div>
          </div>
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Acesse sua conta" : "Criar conta"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "signin"
            ? "Painel executivo de vendas imobiliárias."
            : "O primeiro usuário cadastrado torna-se administrador."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-8">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="dn">Nome</Label>
              <Input
                id="dn"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Senha</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-11 font-medium"
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground mt-6">
          {mode === "signin" ? (
            <>
              Não tem conta?{" "}
              <button onClick={() => setMode("signup")} className="text-foreground hover:text-primary transition">
                Criar
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button onClick={() => setMode("signin")} className="text-foreground hover:text-primary transition">
                Entrar
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
