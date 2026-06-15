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
        // If the OpenAPI schema lacks "base_currency" or does not contain "currency_code" under Settlement, it's legacy
        const hasBaseCurrency = schemaStr.includes('"base_currency"');
        const hasSettleCurrency = schemaStr.includes('"/Settlement"') && schemaStr.includes('"currency_code"');
        isLegacyCached = !hasBaseCurrency || !hasSettleCurrency;
        return isLegacyCached;
      }
    } catch (e) {
      // Ignore openapi fetch errors and fall back to query check
    }

    // 2. Fallback to query check if OpenAPI fetch was not successful or threw an error
    try {
      const { error: groupErr } = await supabase
        .from('Group')
        .select('base_currency')
        .limit(1);

      const { error: settleErr } = await supabase
        .from('Settlement')
        .select('currency_code')
        .limit(1);

      const isGroupLegacy = groupErr && (groupErr.code === '42703' || groupErr.message.includes('base_currency') || groupErr.code === 'PGRST100');
      const isSettleLegacy = settleErr && (settleErr.code === '42703' || settleErr.message.includes('currency_code') || settleErr.code === 'PGRST100');

      isLegacyCached = !!(isGroupLegacy || isSettleLegacy);
      return isLegacyCached;
    } catch (e) {
      isLegacyCached = true;
      return true;
    }
  })();

  return isLegacyPromise;
}
