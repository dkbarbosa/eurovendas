import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  LayoutDashboard,
  Table2,
  Users,
  UserCog,
  Building2,
  Sparkles,
  Settings,
  LogOut,
  Shield,
  Activity,
  ClipboardCheck,
  CalendarDays,
  Menu,
  Wallet,
  Receipt,
  Ban,
  UserCircle,
  Users2,
  Target,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LiveSyncBadge } from "@/components/LiveSyncBadge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import logoAsset from "@/assets/logo.png.asset.json";

// Visão da gestão — SOMENTE admin (controle total do mecanismo da empresa).
const MANAGEMENT_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: Table2 },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { to: "/corretores", label: "Corretores", icon: Users },
  { to: "/empreendimentos", label: "Empreendimentos", icon: Building2 },
  { to: "/aprovacoes", label: "Aprovações", icon: ClipboardCheck },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

const ADMIN_NAV = [
  { to: "/admin/integracao", label: "Integração", icon: Activity },
  { to: "/admin/usuarios", label: "Usuários", icon: Shield },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isDiretor, isFinanceiro, isGerente, isCorretor, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const canFinanceiro = isAdmin || isFinanceiro;
  const canManagementNav = isAdmin || isDiretor;

  const roleLabel = isAdmin
    ? "Administrador"
    : isDiretor
    ? "Gestão"
    : isGerente
    ? "Gerente"
    : isFinanceiro
    ? "Financeiro"
    : isCorretor
    ? "Corretor"
    : "Usuário";

  const initials = (user?.user_metadata?.display_name as string | undefined)
    ?.split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U";

  const SidebarContent = (
    <>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-sidebar-border/60 bg-secondary/50">
            <img
              src={logoAsset.url}
              alt="Euro Empreendimentos"
              className="w-10 h-10 object-contain opacity-95"
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-none text-sidebar-foreground truncate">Euro Empreendimentos</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1.5">
              Gestão Comercial
            </div>
          </div>
        </div>
      </div>


      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {(isAdmin || isDiretor || isGerente || isCorretor) && (
          <>
            <SectionLabel>Missão</SectionLabel>
            <NavLink to="/missao" label="Missão de hoje" icon={Target}
              active={loc.pathname === "/missao"} onNavigate={() => setMobileOpen(false)} />
          </>
        )}


        {canManagementNav && (
          <>
            <SectionLabel>Visão da Gestão</SectionLabel>
            {MANAGEMENT_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={loc.pathname === item.to}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
            {(isAdmin || isDiretor) && (
              <NavLink to="/diretor" label="Painel Financeiro" icon={Wallet}
                active={loc.pathname === "/diretor"} onNavigate={() => setMobileOpen(false)} />
            )}
          </>
        )}

        {(isAdmin || isGerente) && (
          <>
            <SectionLabel className="mt-6">Painel Gerência</SectionLabel>
            <NavLink to="/equipe" label="Dashboard Gerência" icon={LayoutDashboard}
              active={loc.pathname === "/equipe"} onNavigate={() => setMobileOpen(false)} />
            <NavLink to="/gerentes" label="Painel Financeiro" icon={Wallet}
              active={loc.pathname === "/gerentes"} onNavigate={() => setMobileOpen(false)} />
            <NavLink to="/empreendimentos" label="Empreendimentos" icon={Building2}
              active={loc.pathname === "/empreendimentos"} onNavigate={() => setMobileOpen(false)} />
          </>
        )}

        {(isAdmin || isCorretor) && (
          <>
            <SectionLabel className="mt-6">Painel Corretor</SectionLabel>
            <NavLink to="/comissoes" label="Comissões" icon={Wallet}
              active={loc.pathname === "/comissoes"} onNavigate={() => setMobileOpen(false)} />
            <NavLink to="/empreendimentos" label="Empreendimentos" icon={Building2}
              active={loc.pathname === "/empreendimentos"} onNavigate={() => setMobileOpen(false)} />
          </>
        )}


        <SectionLabel className="mt-6">Conta</SectionLabel>
        <NavLink to="/conta" label="Minha Conta" icon={UserCircle}
          active={loc.pathname === "/conta"} onNavigate={() => setMobileOpen(false)} />


        {canFinanceiro && (
          <>
            <SectionLabel className="mt-6">Painel Financeiro</SectionLabel>
            <NavLink to="/financeiro" label="Financeiro Euro" icon={Receipt}
              active={loc.pathname === "/financeiro"} onNavigate={() => setMobileOpen(false)} />
            <NavLink to="/distratos" label="Distratos" icon={Ban}
              active={loc.pathname === "/distratos"} onNavigate={() => setMobileOpen(false)} />
          </>
        )}

        {isAdmin && (
          <>
            <SectionLabel className="mt-6">Administração</SectionLabel>
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                {...item}
                active={loc.pathname === item.to}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </>
        )}
      </nav>


      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-2 rounded-lg">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {(user?.user_metadata?.display_name as string) ?? user?.email}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {roleLabel}
            </div>

          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await signOut();
              nav({ to: "/login" });
            }}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-sidebar-border bg-sidebar shrink-0">
        {SidebarContent}
      </aside>

      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-30 backdrop-blur-md bg-background/60 border-b border-border/60">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-3">
            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border flex flex-col">
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                {SidebarContent}
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-3 ml-auto">
              {false && isAdmin && <LiveSyncBadge />}
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  nav({ to: "/login" });
                }}
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={loc.pathname}
            initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="p-4 sm:p-6 lg:p-10 max-w-[1600px] mx-auto"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof Settings;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative group ${
        active
          ? "bg-secondary text-foreground"
          : "text-sidebar-foreground hover:bg-secondary/50"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
          style={{ background: "var(--gradient-primary)" }}
        />
      )}
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 mb-2 ${className}`}>
      <span
        className="h-px flex-1 opacity-60"
        style={{ background: "linear-gradient(90deg, transparent, var(--sidebar-border, oklch(1 0 0 / 12%)) 35%, transparent)" }}
      />
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.18em] bg-clip-text text-transparent whitespace-nowrap"
        style={{ backgroundImage: "var(--gradient-primary)" }}
      >
        {children}
      </span>
      <span
        className="h-px flex-1 opacity-60"
        style={{ background: "linear-gradient(90deg, transparent, var(--sidebar-border, oklch(1 0 0 / 12%)) 35%, transparent)" }}
      />
    </div>
  );
}
