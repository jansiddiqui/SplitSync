console.log("Environment Variables:");
for (const [key, value] of Object.entries(process.env)) {
  if (key.includes('SUPABASE') || key.includes('DATABASE') || key.includes('PG') || key.includes('VITE') || key.includes('PORT')) {
    console.log(`${key}: ${value.substring(0, 15)}...`);
  }
}
