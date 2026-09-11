// Preserve the historical reports. Original harnesses keep their DB guards.
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const kind=process.argv[2];
if(!['reception','phase456'].includes(kind))throw Error('Usage: node run-review-regressions.cjs reception|phase456');
const filename=path.join(__dirname,'test-'+(kind==='reception'?'reception':'phase456')+'-review.cjs');
const old=kind==='reception'?'RECEPTION-TEST-RESULTS.json':'PHASE456-TEST-RESULTS.json';
const output=process.env.TEST_RESULTS_NAME || 'COMPLETE-REGRESSION-'+kind.toUpperCase()+'.json';
if(path.basename(output)!==output||!output.endsWith('.json'))throw Error('TEST_RESULTS_NAME must be a JSON filename');
let source=fs.readFileSync(filename,'utf8').replace(old,output);
// Keep fixture writes on the owner connection, but run the application with
// the same restricted role/permissions used by deployment.
source=source.replace("require('reflect-metadata');",`require('reflect-metadata');
if(process.env.TEST_APP_DATABASE_URL){
 const runtimeUrl=new URL(process.env.TEST_APP_DATABASE_URL);
 if(runtimeUrl.host!==url.host||runtimeUrl.pathname!==url.pathname)throw Error('Runtime role must target the same disposable database');
 process.env.APP_DATABASE_URL=runtimeUrl.href;
}`);
// Absence auditing now requires the same inactive system actor as production seed.
if(kind==='reception')source=source.replace('async function main() {',`async function main() {
  await db.user.upsert({where:{username:'system'},update:{},create:{username:'system',fullName:'Synthetic system',passwordHash:'unused',isActive:false}});`);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(__dirname);mod._compile(source,filename);
