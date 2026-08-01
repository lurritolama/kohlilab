/**
 * Supabase-Client mit Service-Role-Key. Umgeht Row Level Security.
 *
 * DARF NUR IN SERVER-CODE IMPORTIERT WERDEN: API-Routes und Astro-Frontmatter
 * von Seiten mit `prerender = false`. Nie in <script>-Blöcken oder
 * Client-Komponenten – der Key wäre sonst im Browser-Bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let instanz: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  // In der Netlify-Function sind nicht-öffentliche Env-Vars zur Laufzeit über
  // process.env verlässlich (import.meta.env kann leer sein) -> Fallback.
  const env: Record<string, string | undefined> = { ...(import.meta.env as any), ...(typeof process !== 'undefined' ? process.env : {}) };
  const url = env.PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase ist nicht konfiguriert: PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in der .env setzen.',
    );
  }

  if (!instanz) {
    instanz = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return instanz;
}
