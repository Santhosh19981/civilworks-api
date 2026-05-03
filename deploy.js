const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const SERVER = '157.173.222.55';
const USER = 'root';
const PASS = 'Bhargav@2026';

const ADMIN_ZIP = 'd:/Civil works applicaitons/civilworksadmin/admin-prod.zip';
const API_SRC = 'd:/Civil works applicaitons/civilworks-api/src';
const API_PKG = 'd:/Civil works applicaitons/civilworks-api/package.json';
const API_PKG_LOCK = 'd:/Civil works applicaitons/civilworks-api/package-lock.json';
const API_ENV_PROD = 'd:/Civil works applicaitons/civilworks-api/.env.production';
const API_ENV_QA = 'd:/Civil works applicaitons/civilworks-api/.env.qa';

const ADMIN_REMOTE = '/var/www/civilworks-prod/admin';
const API_PROD_REMOTE = '/var/www/civilworks-prod/api';
const API_QA_REMOTE = '/var/www/civilworks-qa/api';

function runSSH(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => { out += d; process.stdout.write(d.toString()); });
      stream.stderr.on('data', d => { errOut += d; process.stderr.write(d.toString()); });
      stream.on('close', (code) => resolve({ code, out, errOut }));
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const name = path.basename(localPath);
    process.stdout.write(`  Uploading ${name}... `);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) { console.log('FAIL'); return reject(err); }
      console.log('OK');
      resolve();
    });
  });
}

function uploadDir(sftp, conn, localDir, remoteDir) {
  return new Promise(async (resolve, reject) => {
    try {
      await runSSH(conn, `mkdir -p "${remoteDir}"`);
      const items = fs.readdirSync(localDir);
      for (const item of items) {
        const local = path.join(localDir, item);
        const remote = remoteDir + '/' + item;
        const stat = fs.statSync(local);
        if (stat.isDirectory()) {
          await uploadDir(sftp, conn, local, remote);
        } else {
          await uploadFile(sftp, local.replace(/\\/g, '/'), remote);
        }
      }
      resolve();
    } catch(e) { reject(e); }
  });
}

async function deploy() {
  console.log('=== CivilWorks Deployment ===');
  console.log(`Connecting to ${SERVER}...`);

  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject)
      .connect({ host: SERVER, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
  });

  console.log('Connected!\n');

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });

  // 1. Setup directories
  console.log('--- Setting up directories ---');
  await runSSH(conn, `mkdir -p ${ADMIN_REMOTE} ${API_PROD_REMOTE} ${API_QA_REMOTE}`);

  // 2. Upload admin zip
  console.log('\n--- Uploading Admin (zip) ---');
  await uploadFile(sftp, ADMIN_ZIP.replace(/\\/g, '/'), `${ADMIN_REMOTE}/admin-prod.zip`);
  await runSSH(conn, `cd ${ADMIN_REMOTE} && unzip -o admin-prod.zip -d . && rm admin-prod.zip`);
  console.log('Admin deployed!\n');

  // 3. Upload API src
  console.log('--- Uploading API source files ---');
  await uploadDir(sftp, conn, API_SRC, API_PROD_REMOTE + '/src');
  await uploadFile(sftp, API_PKG, API_PROD_REMOTE + '/package.json');
  await uploadFile(sftp, API_PKG_LOCK, API_PROD_REMOTE + '/package-lock.json');
  await uploadFile(sftp, API_ENV_PROD, API_PROD_REMOTE + '/.env');
  console.log('API PROD source uploaded!\n');

  // 4. Upload API QA
  console.log('--- Uploading API QA files ---');
  await runSSH(conn, `cp -r ${API_PROD_REMOTE}/src ${API_QA_REMOTE}/`);
  await uploadFile(sftp, API_PKG, API_QA_REMOTE + '/package.json');
  await uploadFile(sftp, API_PKG_LOCK, API_QA_REMOTE + '/package-lock.json');
  await uploadFile(sftp, API_ENV_QA, API_QA_REMOTE + '/.env');
  console.log('API QA files set!\n');

  sftp.end();

  // 5. npm install and PM2 restart
  console.log('--- Installing dependencies (PROD) ---');
  await runSSH(conn, `cd ${API_PROD_REMOTE} && npm install --production 2>&1 | tail -3`);

  console.log('--- Installing dependencies (QA) ---');
  await runSSH(conn, `cd ${API_QA_REMOTE} && npm install --production 2>&1 | tail -3`);

  console.log('--- Restarting PM2 services ---');
  await runSSH(conn, `pm2 delete civilworks-prod-api || true`);
  await runSSH(conn, `pm2 start ${API_PROD_REMOTE}/src/server.js --name civilworks-prod-api`);
  await runSSH(conn, `pm2 delete civilworks-qa-api || true`);
  await runSSH(conn, `NODE_ENV=qa PORT=5001 pm2 start ${API_QA_REMOTE}/src/server.js --name civilworks-qa-api`);
  await runSSH(conn, 'pm2 save && pm2 list');

  conn.end();
  console.log('\n=== DEPLOYMENT COMPLETE! ===');
  console.log('Admin: https://admin.civilworks.in');
  console.log('API Prod: https://api.civilworks.in/api/v1/health');
}

deploy().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });
