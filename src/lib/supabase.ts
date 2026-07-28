import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();

const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

const hasValidUrl = Boolean(url && /^https?:\/\//i.test(url));

export const isConfigured = hasValidUrl && Boolean(publishableKey);

// Una URL inválida hace que `createClient` lance en la evaluación del módulo y
// deje la app en blanco, así que se usa un placeholder y la UI reporta el error
// vía `isConfigured`.
export const supabase = createClient(
  hasValidUrl ? url! : "http://localhost",
  publishableKey ?? "anon",
  {
    auth: { persistSession: false },
  },
);
