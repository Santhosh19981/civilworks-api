const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: '157.173.222.55',
  user: 'civilworks_user',
  password: 'Civilworks@123',
  database: 'civilworks_prod'
});
connection.query('SELECT count(*) as count FROM categories', (err, results) => {
  console.log(err || results);
  process.exit();
});
