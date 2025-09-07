// Quick Node script to test parseOceanText/parseSpecText from cloudflare-worker.js
const fs = require('fs');
const path = require('path');
const parsers = require(path.resolve(__dirname, 'ndbc-parsers.js'));

function read(p){ return fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8'); }

try{
  const ocean = read('ndbc-45161.ocean.txt');
  const spec = read('ndbc-45161.spec.txt');
  console.log('--- Testing parseOceanText ---');
  const po = parsers.parseOceanText ? parsers.parseOceanText(ocean) : null;
  console.log(JSON.stringify(po, null, 2));
  console.log('--- Testing parseSpecText ---');
  const ps = parsers.parseSpecText ? parsers.parseSpecText(spec) : null;
  console.log(JSON.stringify(ps, null, 2));
}catch(err){
  console.error('Error running tests', err);
  process.exit(2);
}
