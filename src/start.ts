import { createStart, createMiddleware } from "@tanstack/react-start";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { renderErrorPage } from "./lib/error-page";

// Cabeçalhos HTTP de segurança aplicados a TODA resposta server-rendered.
// CSP intencionalmente permissiva ('unsafe-inline'/'unsafe-eval') porque Vite/Tanstack
// injeta scripts inline durante hidratação; reforço de XSS é feito via React + Zod.
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  // X-Frame-Options omitido para permitir embed em previews do Lovable.
  // Proteção de clickjacking em produção pode ser feita via CSP frame-ancestors.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function withSecurityHeaders(response: Response): Response {
  // Não mutar Response existente — clonar headers
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const result = await next();
    // `next()` em requestMiddleware retorna { response }
    if (result && typeof result === "object" && "response" in result && result.response instanceof Response) {
      return { ...result, response: withSecurityHeaders(result.response) };
    }
    return result;
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return withSecurityHeaders(
      new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
