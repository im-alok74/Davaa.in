const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function runMigrations() {
  const sql = neon(process.env.DATABASE_URL);
  
  const migrationFiles = [
    '001-init-tables.sql',
    '002-seed-data.sql',
    '003-add-more-medicines.sql',
    '004-add-even-more-medicines.sql',
    '005-create-admin-user.sql',
    '011-create-addresses-table.sql',
    '012-update-orders-table.sql',
    '013-add-medicine-batch-details.sql',
    '014-add-medicine-fields.sql',
    '015-add-photo-and-mfg-to-medicines.sql',
    '016-add-photo-description-to-medicines.sql',
    '017-medicine-images.sql',
    '018-create-medicine-reviews.sql',
    '020-seed-common-medicines.sql',
    '021-out-of-stock-requests.sql',
    '022-create-settings-table.sql',
    '023-medicine-master-search-and-bulk.sql',
    '025-customer-out-of-stock-requests.sql',
  ];

  try {
    for (const file of migrationFiles) {
      const filePath = path.join(__dirname, 'scripts', file);
      if (!fs.existsSync(filePath)) {
        console.log(`⏭️  Skipping ${file} - not found`);
        continue;
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`\n📝 Running ${file}...`);
      
      // Split by semicolon and execute each statement
      const statements = content.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        try {
          const trimmed = statement.trim();
          if (!trimmed) continue;
          
          console.log(`  ✓ Executing statement...`);
          await sql.query(trimmed);
        } catch (err) {
          if (err.message.includes('already exists')) {
            console.log(`  ℹ️  Table/index already exists (safe to ignore)`);
          } else {
            throw err;
          }
        }
      }
      
      console.log(`✅ ${file} completed`);
    }
    
    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigrations();
