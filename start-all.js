// Starts the common server, seller interface, and three independent buyer interfaces.
const { spawn } = require('child_process');
const path = require('path');
const { CONSUMER2_PORT, CONSUMER3_PORT } = require('./config');

const specs = [
  { file: 'server/server.js' },
  { file: 'seller/server.js' },
  { file: 'consumer/server.js' },
  { file: 'consumer/server.js', env: { CONSUMER_PORT: String(CONSUMER2_PORT) } },
  { file: 'consumer/server.js', env: { CONSUMER_PORT: String(CONSUMER3_PORT) } }
];
const procs = specs.map(({ file, env }) =>
  spawn(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit', env: { ...process.env, ...env }
  })
);

const stop = () => procs.forEach((p) => p.kill());
procs.forEach((p) => p.on('exit', (code) => { if (code) { console.error('A process exited with code', code); stop(); process.exit(code); } }));
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
