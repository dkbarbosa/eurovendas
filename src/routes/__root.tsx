import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

import appCss from "../styles.css?url";

let authCacheBridgeBound = false;
function ensureAuthCacheBridge(queryClient: QueryClient) {
  if (authCacheBridgeBound) return;
  authCacheBridgeBound = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      queryClient.invalidateQueries();
    }
  });
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VGV Analytics — Euro Empreendimentos" },
      {
        name: "description",
        content:
          "Dashboard executivo para análise comercial de vendas, comissões e aprovações da Euro Empreendimentos.",
      },
      { property: "og:title", content: "VGV Analytics — Euro Empreendimentos" },
      {
        property: "og:description",
        content:
          "Dashboard executivo para análise comercial de vendas, comissões e aprovações da Euro Empreendimentos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "VGV Analytics — Euro Empreendimentos" },
      {
        name: "twitter:description",
        content:
          "Dashboard executivo para análise comercial de vendas, comissões e aprovações da Euro Empreendimentos.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthCacheBridge />
        <Outlet />
        <Toaster richColors theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthCacheBridge() {
  const { queryClient } = Route.useRouteContext();
  // Invalida caches de dados ao trocar/encerrar sessão para evitar exibir
  // dados do usuário anterior.
  if (typeof window !== "undefined") {
    // Lazy-bound singleton listener — montado uma única vez por sessão de browser.
    void ensureAuthCacheBridge(queryClient);
  }
  return null;
}
