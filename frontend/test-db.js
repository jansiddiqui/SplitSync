const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log("Checking table structure...");

  const tables = ['Group', 'GroupMember', 'Expense', 'Settlement', 'ImportJob', 'AnomalyLog', 'ImportReport'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ Table or query on "${table}" failed:`, error.message);
    } else {
      console.log(`✅ Table "${table}" is queryable. Rows found:`, data.length);
      if (data.length > 0) {
        console.log(`   Sample keys:`, Object.keys(data[0]));
      }
    }
  }
}

test();
