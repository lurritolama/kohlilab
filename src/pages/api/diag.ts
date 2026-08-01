export const prerender = false;
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/server/supabase-admin';
import pkg from '@supabase/supabase-js/package.json';

export const GET: APIRoute = async () => {
  const out: Record<string, any> = { supabaseVersion: (pkg as any).version };
  try {
    const db = supabaseAdmin();
    out.client = 'ok';
    const { data, error } = await db.from('shops').select('shop, order_prefix').eq('shop', 'kohlilab').maybeSingle();
    out.query = error ? { fehler: error.message } : { data };
  } catch (e) {
    out.client = 'THROW';
    out.fehler = (e as Error).message;
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } });
};
