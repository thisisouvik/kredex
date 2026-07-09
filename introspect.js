const { Client } = require('pg');

async function checkFK() {
  const client = new Client({
    connectionString: "postgresql://postgres:35lBoLHeiURN4cNk@db.awwwkeekcapbwhkgtnya.supabase.co:5432/postgres?sslmode=require&sslaccept=accept_invalid_certs",
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'profiles';
    `);

    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch (err) {
    console.error(err);
  }
}

checkFK();
