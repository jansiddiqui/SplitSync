const supabaseUrl = "https://srgqhaivslybqmqiebas.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyZ3FoYWl2c2x5YnFtcWllYmFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjM5NTAsImV4cCI6MjA5Njk5OTk1MH0.0DpaOLBPmK2j3Lty0_zd2nzFdiGmeFWFF84ABbnFotM";

async function test() {
  console.log("Checking table structure via native fetch...");

  const tables = ['Group', 'GroupMember', 'Expense', 'Settlement', 'ImportJob', 'AnomalyLog', 'ImportReport'];

  for (const table of tables) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?limit=1`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.log(`❌ Table or query on "${table}" failed:`, res.status, text);
      } else {
        const data = await res.json();
        console.log(`✅ Table "${table}" is queryable. Rows found:`, data.length);
        if (data.length > 0) {
          console.log(`   Sample keys:`, Object.keys(data[0]));
        }
      }
    } catch (err) {
      console.log(`❌ Fetch to "${table}" failed:`, err.message);
    }
  }
}

test();
