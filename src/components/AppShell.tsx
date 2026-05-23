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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LiveSyncBadge } from "@/components/LiveSyncBadge";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: Table2 },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { to: "/corretores", label: "Corretores", icon: Users },
  { to: "/gerentes", label: "Gerentes", icon: UserCog },
  { to: "/empreendimentos", label: "Empreendimentos", icon: Building2 },
  { to: "/aprovacoes", label: "Aprovações", icon: ClipboardCheck },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

const ADMIN_NAV = [
  { to: "/admin/integracao", label: "Integração", icon: Activity },
  { to: "/admin/usuarios", label: "Usuários", icon: Shield },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isFinanceiro, isCorretor, isStaff, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (user?.user_metadata?.display_name as string | undefined)
    ?.split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U";

  const SidebarContent = (
    <>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl glow-primary flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold leading-none text-sidebar-foreground">Gestão Comercial</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Euro Empreendimentos
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {isStaff && (
          <>
            <SectionLabel>Visão da Gestão</SectionLabel>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                {...item}
                active={loc.pathname === item.to}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </>
        )}

        {(isCorretor || isStaff) && (
          <>
            <SectionLabel className="mt-6">Painel Corretor</SectionLabel>
            <NavLink to="/comissoes" label="Comissões" icon={Wallet}
              active={loc.pathname === "/comissoes"} onNavigate={() => setMobileOpen(false)} />
          </>
        )}

        {(isFinanceiro || isAdmin) && (
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
              {isAdmin ? "Administrador" : "Usuário"}
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
              {isAdmin && <LiveSyncBadge />}
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
