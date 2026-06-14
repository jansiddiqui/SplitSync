import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let isLegacyCached: boolean | null = null;
let isLegacyPromise: Promise<boolean> | null = null;

export async function checkIsLegacySchema(): Promise<boolean> {
  if (isLegacyCached !== null) return isLegacyCached;
  if (isLegacyPromise) return isLegacyPromise;

  isLegacyPromise = (async () => {
    try {
      // 1. Try fetching PostgREST OpenAPI spec directly to inspect the schema.
      // This is clean, fast, returns 200 OK, and avoids any HTTP 400 Bad Request retry loops in sandboxes.
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const schemaStr = JSON.stringify(data);
        // If the OpenAPI schema contains "base_currency", we are on the new schema
        const hasBaseCurrency = schemaStr.includes('"base_currency"');
        isLegacyCached = !hasBaseCurrency;
        return isLegacyCached;
      }
    } catch (e) {
      // Ignore openapi fetch errors and fall back to query check
    }

    // 2. Fallback to query check if OpenAPI fetch was not successful or threw an error
    try {
      const { error } = await supabase
        .from('Group')
        .select('base_currency')
        .limit(1);

      if (error && (error.code === '42703' || error.message.includes('base_currency') || error.code === 'PGRST100')) {
        isLegacyCached = true;
        return true;
      }
      isLegacyCached = false;
      return false;
    } catch (e) {
      isLegacyCached = true;
      return true;
    }
  })();

  return isLegacyPromise;
}
