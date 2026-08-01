export const prerender = false;
import type { APIRoute } from 'astro';

// TEMPORÄR: zeigt nur, OB Env-Keys zur Laufzeit sichtbar sind (keine Werte).
export const GET: APIRoute = async () => {
  const keys = ['PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'SHOP_EMAIL', 'ZAHLUNG_IBAN'];
  const ime: any = import.meta.env;
  const pe: any = typeof process !== 'undefined' ? process.env : {};
  const out: Record<string, any> = { hatProcess: typeof process !== 'undefined' };
  for (const k of keys) out[k] = { importMeta: typeof ime?.[k] === 'string' && ime[k].length > 0, processEnv: typeof pe?.[k] === 'string' && pe[k].length > 0 };
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } });
};
