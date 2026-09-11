const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8'));
const schemas = spec.components.schemas;
const results = [];
function test(name, fn) { try { fn(); results.push({name, status:'PASS'}); } catch(error) { results.push({name, status:'FAIL', error:error.message}); } }
test('Every DTO schema has documented properties', () => {
  for (const [name, schema] of Object.entries(schemas)) assert.ok(Object.keys(schema.properties || {}).length, name);
});
test('All references resolve inside the document', () => {
  function walk(node) { if (!node || typeof node !== 'object') return;
    if(node.$ref) { assert.ok(node.$ref.startsWith('#/')); let target=spec; for(const key of node.$ref.slice(2).split('/'))target=target?.[key.replace(/~1/g,'/').replace(/~0/g,'~')]; assert.ok(target, node.$ref); }
    Object.values(node).forEach(walk);
  } walk(spec);
});
test('Login body requires username/password and is public', () => {
  assert.deepEqual(schemas.LoginDto.required, ['username','password']);
  assert.equal(schemas.LoginDto.properties.password.type, 'string');
  assert.equal(spec.paths['/api/v1/auth/login'].post.security, undefined);
});
test('Protected routes retain bearer authentication and actual permissions', () => {
  const create=spec.paths['/api/v1/patients'].post;
  assert.deepEqual(create.security, [{bearer:[]}]);
  assert.deepEqual(create['x-required-permissions'], ['patient.create']);
  assert.ok(spec.paths['/api/v1/wards'].get['x-any-permissions'].includes('nursing.ward.view'));
});
test('Nested plan array describes items and allowed size', () => {
  const field=schemas.SetDialysisPlanDto.properties.entries;
  assert.equal(field.type,'array'); assert.equal(field.minItems,1); assert.equal(field.maxItems,4);
  assert.equal(field.items.$ref,'#/components/schemas/DialysisPlanEntryDto');
  assert.ok(schemas.DialysisPlanEntryDto.properties.weekday.enum.includes('MON'));
});
test('Optional fields, enums, bounds and inherited properties are described', () => {
  assert.ok(!schemas.CreatePatientDto.required.includes('dryWeight'));
  assert.equal(schemas.CreatePatientDto.properties.dryWeight.minimum,1);
  assert.equal(schemas.CreatePatientDto.properties.dryWeight.maximum,300);
  assert.deepEqual(schemas.UpdateItemStatusDto.properties.status.enum,['SAMPLE_COLLECTED','PROCESSING']);
  assert.ok(schemas.AmendReadingDto.properties.bp);
  assert.ok(schemas.AmendReadingDto.required.includes('reason'));
  assert.ok(!schemas.StartDialysisDto.required.includes('accessInfo'));
});
test('Patient pagination query documents positive integer inputs', () => {
  const params=spec.paths['/api/v1/patients'].get.parameters;
  assert.equal(params.find(p=>p.name==='page').schema.type,'integer');
  assert.equal(params.find(p=>p.name==='limit').schema.minimum,1);
});
test('All documented paths use the running API prefix', () => {
  for(const route of Object.keys(spec.paths))assert.ok(route.startsWith('/api/v1/'),route);
});
const output={suite:'OpenAPI request contract',schemas:Object.keys(schemas).length,paths:Object.keys(spec.paths).length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
fs.writeFileSync(path.join(__dirname,'../../../docs/OPENAPI-TEST-RESULTS.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2)); if(output.failed)process.exitCode=1;
