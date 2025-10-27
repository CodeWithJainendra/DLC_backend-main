const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH_2 = path.join(__dirname, 'DLCServer', 'database.db');
const db2 = new Database(DB_PATH_2, { readonly: true });

console.log('Testing age category query...\n');

const query = `
  SELECT 
    branch_state as state,
    age,
    COUNT(*) as count
  FROM doppw_pensioner_data
  WHERE branch_state IS NOT NULL AND branch_state != ''
  GROUP BY branch_state, age
  LIMIT 20
`;

const results = db2.prepare(query).all();

console.log(`Total results: ${results.length}\n`);

results.forEach((row, index) => {
  const stateName = row.state.trim().toUpperCase();
  const age = row.age || 0;
  const count = row.count || 0;
  
  let ageCategory = '90+';
  if (age >= 50 && age < 60) ageCategory = '50-60';
  else if (age >= 60 && age < 70) ageCategory = '60-70';
  else if (age >= 70 && age < 80) ageCategory = '70-80';
  else if (age >= 80 && age < 90) ageCategory = '80-90';
  
  console.log(`${index + 1}. State: ${stateName.padEnd(20)} Age: ${age.toString().padStart(3)} Count: ${count.toString().padStart(6)} Category: ${ageCategory}`);
});

db2.close();
