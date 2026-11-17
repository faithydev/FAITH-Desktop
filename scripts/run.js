'use strict';
// Starts the app in development. Editors built on Electron (VS Code) set ELECTRON_RUN_AS_NODE=1
// for their terminals, which would make Electron behave like plain Node, so it is removed here.
const { spawn } = require('node:child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env, cwd: require('node:path').join(__dirname, '..') });
child.on('exit', (code) => process.exit(code ?? 0));
