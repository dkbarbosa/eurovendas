import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VGV Analytics — Euro Empreendimentos" },
      {
        name: "description",
        content:
          "Dashboard executivo premium para análise comercial de vendas imobiliárias da Equipe Maicon.",
      },
      { property: "og:title", content: "VGV Analytics — Euro Empreendimentos" },
      { name: "twitter:title", content: "VGV Analytics — Euro Empreendimentos" },
      { name: "description", content: "Venture Vista is a premium web application for real estate sales analysis." },
      { property: "og:description", content: "Venture Vista is a premium web application for real estate sales analysis." },
      { name: "twitter:description", content: "Venture Vista is a premium web application for real estate sales analysis." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2b13bc65-cf3a-4c25-8c11-08ece15f3284/id-preview-d2a2d700--7a96a12d-6e08-4387-b430-efb81cd9f886.lovable.app-1778521242832.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2b13bc65-cf3a-4c25-8c11-08ece15f3284/id-preview-d2a2d700--7a96a12d-6e08-4387-b430-efb81cd9f886.lovable.app-1778521242832.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
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
        <Outlet />
        <Toaster richColors theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
