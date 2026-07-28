import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;

const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && publishableKey);

export const supabase = createClient(
  url ?? "http://localhost",
  publishableKey ?? "anon",
  {
    auth: { persistSession: false },
  },
);
