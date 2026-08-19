import { createClient } from "@supabase/supabase-js";

const defaultSupabaseUrl = "https://xwsergbpvkcsugexssmc.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_ZyCh_dhmxHpZ-OX5tLP2aQ_nFNno42X";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || defaultSupabasePublishableKey;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    experimental: { passkey: true },
  },
});
