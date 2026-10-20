/**
 * Edge Function 共用：判斷呼叫者是誰。
 * - 排程：帶 x-cron-secret 標頭，值必須等於環境變數 CRON_SECRET
 * - 使用者：帶 Authorization: Bearer <登入 token>，由 Supabase Auth 驗證
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Caller = { type: 'cron' } | { type: 'user'; userId: string } | { type: 'anonymous' };

export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

export async function identifyCaller(req: Request): Promise<Caller> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const given = req.headers.get('x-cron-secret');
  if (cronSecret && given && timingSafeEqual(given, cronSecret)) return { type: 'cron' };

  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (!error && data.user) return { type: 'user', userId: data.user.id };
  }
  return { type: 'anonymous' };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** 前端從瀏覽器呼叫時需要 CORS */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
