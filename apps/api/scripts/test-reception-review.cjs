// Review integration suite. Run build:api first and migrate a DISPOSABLE database.
// Requires TEST_DATABASE_URL with database name reception_test; never uses project .env.
// Example: node apps/api/scripts/test-reception-review.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.TEST_DATABASE_URL || 'http://missing');
if (url.pathname !== '/reception_test' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
  throw new Error('Use a disposable localhost database named reception_test via TEST_DATABASE_URL');
}
process.env.DATABASE_URL = url.href;
process.env.APP_DATABASE_URL = url.href;
process.env.JWT_SECRET = 'reception-review-' + randomUUID();
process.env.SUPER_ADMIN_PASSWORD = 'Review-only-' + randomUUID();
process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Baghdad';
process.env.DOTENV_CONFIG_PATH = path.join(__dirname, '__no_test_env_file__');
const RealDate = Date;
let clock = RealDate.parse('2026-09-08T05:00:00+03:00');
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const at = (localTime) => { clock = RealDate.parse(localTime); };
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { AppModule } = require('../dist/app.module');
const { SchedulingService } = require('../dist/scheduling/scheduling.service');
const { AuditService } = require('../dist/audit/audit.service');
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); }
  console.log(`${results.at(-1).status}: ${name}`);
}
let app;
async function main() {
  const suffix = randomUUID();
  const permission = await db.permission.upsert({where:{key:'attendance.checkin'},update:{},create:{key:'attendance.checkin',module:'reception'}});
  const role = await db.role.create({data:{name:'TEST_RECEPTION_'+suffix,permissions:{create:{permissionId:permission.id}}}});
  const actor = await db.user.create({data:{username:'reception_'+suffix,passwordHash:'unused',fullName:'Synthetic Reception',roles:{create:{roleId:role.id}}}});
  const denied = await db.user.create({data:{username:'denied_'+suffix,passwordHash:'unused',fullName:'Synthetic No Permissions'}});
  const shift = await db.shift.upsert({where:{name:'SHIFT_1'},update:{dialysisStart:'06:00',dialysisEnd:'10:00',lateThresholdMinutes:30},create:{name:'SHIFT_1',dialysisStart:'06:00',dialysisEnd:'10:00',cleaningStart:'10:00',cleaningEnd:'12:00',lateThresholdMinutes:30}});
  async function fixture(date='2026-09-08', status='SCHEDULED', type='REGULAR') {
    const id = randomUUID();
    const patient = await db.patient.create({data:{fullName:'Synthetic '+id,gender:'MALE',dateOfBirth:new RealDate('1980-01-01'),patientCode:id,barcode:'TEST-'+id,fileNumber:'FILE-'+id}});
    const schedule = await db.dialysisSchedule.create({data:{patientId:patient.id,shiftId:shift.id,scheduledDate:new RealDate(date),status,type}});
    return { patient, schedule };
  }
  app = await NestFactory.create(AppModule,{logger:false});
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  await app.listen(0,'127.0.0.1');
  const base = await app.getUrl();
  const jwt = new JwtService({secret:process.env.JWT_SECRET});
  const token = jwt.sign({sub:actor.id,tokenVersion:actor.tokenVersion},{expiresIn:'365d'});
  const deniedToken = jwt.sign({sub:denied.id,tokenVersion:denied.tokenVersion},{expiresIn:'365d'});
  async function request(route, body, auth=token) {
    const response = await fetch(base+'/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const normal = await fixture();
  await test('HTTP unauthenticated scan -> 401',async()=>assert.equal((await request('/reception/scan/'+normal.patient.barcode,undefined,null)).status,401));
  await test('HTTP no-permission check-in -> 403',async()=>assert.equal((await request('/sessions/'+normal.schedule.id+'/check-in',{stationId:'A'},deniedToken)).status,403));
  await test('HTTP no-permission scan -> 403',async()=>assert.equal((await request('/reception/scan/'+normal.patient.barcode,undefined,deniedToken)).status,403));
  await test('HTTP valid scan returns patient/file/today schedule',async()=>{const r=await request('/reception/scan/'+normal.patient.barcode);assert.equal(r.status,200);assert.equal(r.body.patient.fileNumber,normal.patient.fileNumber);assert.equal(r.body.todaySchedules[0].id,normal.schedule.id);});
  await test('HTTP unknown barcode -> 404',async()=>assert.equal((await request('/reception/scan/NOT-A-REAL-BARCODE')).status,404));
  await test('HTTP unknown schedule -> 404',async()=>assert.equal((await request('/sessions/'+randomUUID()+'/check-in',{stationId:'A'})).status,404));
  await test('HTTP rejects client supplied checkInTime -> 400',async()=>assert.equal((await request('/sessions/'+normal.schedule.id+'/check-in',{stationId:'A',checkInTime:'2026-01-01'})).status,400));
  at('2026-09-08T06:10:00+03:00');
  await test('HTTP normal check-in persists actor/station/time + audit + timeline',async()=>{
    const r=await request('/sessions/'+normal.schedule.id+'/check-in',{stationId:'STATION-A'});assert.equal(r.status,201);assert.equal(r.body.status,'ARRIVED');assert.equal(r.body.lateMinutes,10);assert.equal(r.body.checkInByUserId,actor.id);assert.equal(r.body.checkInStationId,'STATION-A');assert.equal(r.body.checkInTime,new Date().toISOString());
    assert.equal(await db.auditLog.count({where:{entityId:normal.schedule.id,action:'PATIENT_CHECKED_IN'}}),1);
    assert.equal(await db.patientTimelineEvent.count({where:{patientId:normal.patient.id,type:'PATIENT_CHECKED_IN'}}),1);
  });
  await test('Sequential duplicate -> 409 and no second audit',async()=>{assert.equal((await request('/sessions/'+normal.schedule.id+'/check-in',{stationId:'B'})).status,409);assert.equal(await db.auditLog.count({where:{entityId:normal.schedule.id}}),1);});
  for (const [time,expected] of [['06:30:00','ARRIVED'],['06:30:01','LATE'],['06:31:00','LATE']]) {
    const f=await fixture();at('2026-09-08T'+time+'+03:00');
    await test('Late boundary '+time+' -> '+expected,async()=>assert.equal((await request('/sessions/'+f.schedule.id+'/check-in',{stationId:'A'})).body.status,expected));
  }
  for(const type of ['EXTRA','EMERGENCY']){
    const f=await fixture('2026-09-08','SCHEDULED',type);
    await test(type+' can check in and keeps type',async()=>{const r=await request('/sessions/'+f.schedule.id+'/check-in',{stationId:'A'});assert.equal(r.status,201);assert.equal(r.body.type,type);assert.equal(r.body.status,'LATE');});
  }
  const cancelled=await fixture('2026-09-08','CANCELLED');
  await test('CANCELLED check-in -> 409',async()=>assert.equal((await request('/sessions/'+cancelled.schedule.id+'/check-in',{stationId:'A'})).status,409));
  const future=await fixture('2026-09-09');
  await test('Future-day check-in must be rejected',async()=>{const r=await request('/sessions/'+future.schedule.id+'/check-in',{stationId:'A'});assert.ok([400,409].includes(r.status),'Expected 400/409, got '+r.status+' '+r.body.status);});
  const past=await fixture('2026-09-07');
  await test('Previous-day check-in must require explicit correction',async()=>{const r=await request('/sessions/'+past.schedule.id+'/check-in',{stationId:'A'});assert.ok([400,409].includes(r.status),'Expected 400/409, got '+r.status+' '+r.body.status);});
  const noStation=await fixture();
  await test('Missing station must be rejected',async()=>assert.equal((await request('/sessions/'+noStation.schedule.id+'/check-in',{})).status,400));
  const absent=await fixture();at('2026-09-08T10:01:00+03:00');
  await test('Board read marks overdue SCHEDULED as ABSENT and reports it',async()=>{
    const r=await request('/schedule?date=2026-09-08&status=ABSENT');assert.equal(r.status,200);assert.ok(r.body.some(x=>x.id===absent.schedule.id));const row=await db.dialysisSchedule.findUnique({where:{id:absent.schedule.id}});assert.equal(row.status,'ABSENT');assert.ok(row.absentMarkedAt);
  });
  await test('Automatic absence must write audit and timeline',async()=>{const audits=await db.auditLog.count({where:{entityId:absent.schedule.id}});const events=await db.patientTimelineEvent.count({where:{patientId:absent.patient.id}});assert.ok(audits>0&&events>0,`audit=${audits}, timeline=${events}`);});
  await test('Repeated absence read preserves marker',async()=>{const before=await db.dialysisSchedule.findUnique({where:{id:absent.schedule.id}});at('2026-09-08T10:02:00+03:00');await request('/schedule?date=2026-09-08');const after=await db.dialysisSchedule.findUnique({where:{id:absent.schedule.id}});assert.equal(+before.absentMarkedAt,+after.absentMarkedAt);});
  await test('ABSENT patient can arrive late with timeline',async()=>{const r=await request('/sessions/'+absent.schedule.id+'/check-in',{stationId:'A'});assert.equal(r.body.status,'LATE');assert.equal(await db.patientTimelineEvent.count({where:{patientId:absent.patient.id,type:'PATIENT_CHECKED_IN_LATE'}}),1);});
  await test('Invalid status filter -> 400',async()=>assert.equal((await request('/schedule?date=2026-09-08&status=NOT_A_STATUS')).status,400));
  // Real DB concurrency, barrier delays both reads until both see SCHEDULED.
  const race=await fixture();at('2026-09-08T06:15:00+03:00');
  await test('Concurrent check-in produces one committed check-in',async()=>{
    let reads=0,release;const gate=new Promise(r=>release=r);
    const wrapped=new Proxy(db,{get(target,key){if(key==='dialysisSchedule')return new Proxy(target.dialysisSchedule,{get(delegate,method){if(method==='findUnique')return async(args)=>{const row=await delegate.findUnique(args);if(++reads===2)release();await gate;return row;};const value=delegate[method];return typeof value==='function'?value.bind(delegate):value;}});const value=target[key];return typeof value==='function'?value.bind(target):value;}});
    const service=new SchedulingService(wrapped,new AuditService(db),{emit:()=>{}});
    const auth={id:actor.id,roles:[role.name],permissions:['attendance.checkin']};
    const outcomes=await Promise.allSettled([service.checkIn(race.schedule.id,{stationId:'A'},auth),service.checkIn(race.schedule.id,{stationId:'B'},auth)]);
    const count=await db.auditLog.count({where:{entityId:race.schedule.id}});
    assert.equal(count,1,'Committed audits='+count+', successful calls='+outcomes.filter(x=>x.status==='fulfilled').length);
  });
  const rollback=await fixture();
  await test('Audit failure rolls back check-in transaction',async()=>{
    const service=new SchedulingService(db,{log:async()=>{throw new Error('injected audit failure');}},{emit:()=>{}});
    await assert.rejects(service.checkIn(rollback.schedule.id,{stationId:'A'},{id:actor.id,roles:[]}),/injected audit failure/);
    const row=await db.dialysisSchedule.findUnique({where:{id:rollback.schedule.id}});assert.equal(row.status,'SCHEDULED');assert.equal(row.checkInTime,null);assert.equal(await db.patientTimelineEvent.count({where:{patientId:rollback.patient.id}}),0);
  });
}
main().catch(e=>{console.error(e);process.exitCode=2;}).finally(async()=>{
  if(app)await app.close();await db.$disconnect();global.Date=RealDate;
  const output={suite:'Phase 3 Reception',database:'disposable PostgreSQL 16',passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
  fs.writeFileSync(path.resolve(__dirname,'../../../docs/RECEPTION-TEST-RESULTS.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({passed:output.passed,failed:output.failed}));
  if(output.failed&&!process.exitCode)process.exitCode=1;
});
