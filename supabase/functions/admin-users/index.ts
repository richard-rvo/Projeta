import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from './handler.js';

const url = Deno.env.get('SUPABASE_URL')!;
const siteUrl = Deno.env.get('SITE_URL')!;

const adminClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createUserClient = (jwt: string) =>
  createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

Deno.serve(
  createHandler({
    createUserClient,
    adminClient,
    siteUrl,
    allowedOrigins: [new URL(siteUrl).origin, 'http://localhost:5174'],
  }),
);
