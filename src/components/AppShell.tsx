import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: Table2 },
  { to: "/corretores", label: "Corretores", icon: Users },
  { to: "/gerentes", label: "Gerentes", icon: UserCog },
  { to: "/empreendimentos", label: "Empreendimentos", icon: Building2 },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

const ADMIN_NAV = [
  { to: "/admin/integracao", label: "Integração", icon: Activity },
  { to: "/admin/usuarios", label: "Usuários", icon: Shield },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();

  const initials = (user?.user_metadata?.display_name as string | undefined)
    ?.split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-sidebar-border bg-sidebar shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl glow-primary flex items-center justify-center"
              style={{ background: "var(--gradient-primary)" }}>
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold leading-none text-sidebar-foreground">VGV Analytics</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                Equipe Maicon
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2">
            Análise
          </div>
          {NAV.map((item) => (
            <NavLink key={item.to} {...item} active={loc.pathname === item.to} />
          ))}
          {isAdmin && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mt-6 mb-2">
                Administração
              </div>
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.to} {...item} active={loc.pathname === item.to} />
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold">
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
      </aside>

      <main className="flex-1 min-w-0">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="p-6 lg:p-10 max-w-[1600px] mx-auto"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Settings;
  active: boolean;
}) {
  return (
    <Link
      to={to}
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
