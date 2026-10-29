// node make_samples.js <outdir> [cycle]  - writes <form>_flat.pdf (print copy) and <form>_fillable.pdf (editable) for the sample mission
const fs = require('fs'), path = require('path'), L = require('./forms_lib.js');
(async () => {
  const out = process.argv[2] || path.join(__dirname, '..', 'samples'); fs.mkdirSync(out, { recursive: true });
  const env = L.loadEnv(process.argv[3]), m = L.sampleMission(env);
  for (const k of ['dd1801', 'dd1801c', 'dd175-1', 'dd175']) {
    for (const [sfx, flatten] of [['flat', true], ['fillable', false]]) {
      const r = await L.build(k, m, env, { flatten }); fs.writeFileSync(path.join(out, `${k}_${sfx}.pdf`), r.bytes);
    }
  }
  console.log('wrote samples to', out);
})().catch(e => { console.error(e); process.exit(1); });
