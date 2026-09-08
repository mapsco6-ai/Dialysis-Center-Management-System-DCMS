// Integration review: build API, migrate a NEW disposable local phase456_test DB,
// then set TEST_DATABASE_URL and run this file. Never uses the application DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.TEST_DATABASE_URL || 'http://missing');
if (url.pathname !== '/phase456_test' || !['localhost','127.0.0.1'].includes(url.hostname)) throw Error('Disposable local phase456_test required');
Object.assign(process.env,{DATABASE_URL:url.href,APP_DATABASE_URL:url.href,JWT_SECRET:randomUUID()+randomUUID(),SUPER_ADMIN_PASSWORD:randomUUID(),NODE_ENV:'test',TZ:'Asia/Baghdad'});
require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');
const {ValidationPipe}=require('@nestjs/common');
const {JwtService}=require('@nestjs/jwt');
const {PrismaClient}=require('@prisma/client');
const {AppModule}=require('../dist/app.module');
const db=new PrismaClient({datasources:{db:{url:url.href}}});
const results=[];let app;
async function test(phase,name,fn){try{await fn();results.push({phase,name,status:'PASS'});}catch(e){results.push({phase,name,status:'FAIL',error:e.message});}console.log(results.at(-1).status+' P'+phase+': '+name);}
async function main(){
 const keys=['inventory.view','inventory.manage','inventory.issue','machine.view','machine.manage','machine.assign','approval.machine.decide','dialysis.session.view','dialysis.pre.record','dialysis.start','dialysis.end','dialysis.reading.create','dialysis.event.create'];
 const permissions=await Promise.all(keys.map(key=>db.permission.create({data:{key,module:'test'}})));
 const role=await db.role.create({data:{name:'REVIEW',permissions:{create:permissions.map(p=>({permissionId:p.id}))}}});
 const actor=await db.user.create({data:{username:'review',passwordHash:'unused',fullName:'Synthetic reviewer',roles:{create:{roleId:role.id}}}});
 const denied=await db.user.create({data:{username:'warehouse_without_permissions',passwordHash:'unused',fullName:'Synthetic warehouse'}});
 const nurseRole=await db.role.create({data:{name:'LIMITED_NURSE',permissions:{create:permissions.filter(p=>p.key==='dialysis.start').map(p=>({permissionId:p.id}))}}});
 const nurse=await db.user.create({data:{username:'limited_nurse',passwordHash:'unused',fullName:'Limited Nurse',roles:{create:{roleId:nurseRole.id}}}});
 const warehouse=await db.stockLocation.create({data:{type:'MAIN_WAREHOUSE',name:'Test'}});
 const shift=await db.shift.create({data:{name:'SHIFT_1',dialysisStart:'06:00',dialysisEnd:'10:00',cleaningStart:'10:00',cleaningEnd:'12:00'}});
 const ward=await db.ward.create({data:{name:'TEST'}});
 app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
 const base=await app.getUrl();const jwt=new JwtService({secret:process.env.JWT_SECRET});const token=u=>jwt.sign({sub:u.id,tokenVersion:u.tokenVersion});
 async function req(route,body,who=actor,method){const r=await fetch(base+'/api/v1'+route,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(who?{Authorization:'Bearer '+token(who)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {code:r.status,data:await r.json()};}
 async function ok(route,body,who=actor,method){const r=await req(route,body,who,method);assert.ok(r.code<300,JSON.stringify(r));return r.data;}
 const rejected=r=>assert.ok([400,403,409].includes(r.code),'Expected rejection, got '+r.code+' '+JSON.stringify(r.data));
 async function fixture(status='ARRIVED'){const id=randomUUID();const p=await db.patient.create({data:{patientCode:id,barcode:id,fullName:'Synthetic patient',gender:'MALE',dateOfBirth:new Date('1980-01-01')}});const s=await db.dialysisSchedule.create({data:{patientId:p.id,shiftId:shift.id,scheduledDate:new Date('2026-09-08'),status}});return {p,s};}
 async function item(q=10){const i=await ok('/inventory/items',{name:randomUUID(),category:'test',unit:'unit'});if(q)await ok('/inventory/items/'+i.id+'/stock/adjust',{quantity:q,direction:'INCREASE',reason:'test stock'});return i;}
 const balance=async i=>Number((await db.stockBalance.findUnique({where:{itemId_locationId:{itemId:i.id,locationId:warehouse.id}}})).quantity);
 const profile=(f,i,q=2)=>ok('/patients/'+f.p.id+'/supply-profile',{entries:[{itemId:i.id,defaultQuantity:q}]},actor,'PUT');
 const supplies=f=>'/sessions/'+f.s.id+'/supplies';
 const session=f=>'/sessions/'+f.s.id;
 const pre={weight:70,bp:'120/80',pulse:70,dryWeight:68};
 const start={dialyzerType:'test',bloodLineType:'test',prescribedDurationMinutes:240,requiredUF:2};
 const end={postWeight:68,postBP:'120/80',postPulse:70,actualUF:2};
 async function machine(extra={}){return db.machine.create({data:{machineCode:randomUUID(),wardId:ward.id,...extra}});}
 async function prepared(){const f=await fixture();await ok(session(f)+'/pre-dialysis',pre);await ok(session(f)+'/confirm-supplies-ready',{});const m=await machine();await ok(session(f)+'/assign-machine',{machineId:m.id,reason:'test'});return {...f,m};}
 async function running(){const f=await prepared();await ok(session(f)+'/start',start);return f;}
 const f=await fixture(),i=await item();await profile(f,i);
 await test(4,'Profile defaults load',async()=>assert.equal((await ok(supplies(f))).pending[0].quantity,2));
 await test(4,'Override is session-only',async()=>{await ok(supplies(f)+'/override',{itemId:i.id,overrideQuantity:3},actor,'PATCH');assert.equal(Number((await ok('/patients/'+f.p.id+'/supply-profile'))[0].defaultQuantity),2);});
 await test(4,'Unauthorized issue is 403',async()=>assert.equal((await req(supplies(f)+'/confirm-issue',{},denied)).code,403));
 await test(4,'Issue deducts stock and records movement',async()=>{await ok(supplies(f)+'/confirm-issue',{});assert.equal(await balance(i),7);assert.equal(await db.stockMovement.count({where:{relatedScheduleId:f.s.id,movementType:'ISSUE'}}),1);});
 await test(4,'Sequential issue retry does not double deduct',async()=>{await ok(supplies(f)+'/confirm-issue',{});assert.equal(await balance(i),7);});
 const shortage=await fixture(),empty=await item(0);await profile(shortage,empty);
 await test(4,'Shortage produces UNAVAILABLE without deduction',async()=>{const r=await ok(supplies(shortage)+'/confirm-issue',{});assert.equal(r.issued[0].status,'UNAVAILABLE');assert.equal(await balance(empty),0);});
 await test(4,'Restock then retry fulfills unavailable line',async()=>{await ok('/inventory/items/'+empty.id+'/stock/adjust',{quantity:10,direction:'INCREASE',reason:'restock'});const r=await ok(supplies(shortage)+'/confirm-issue',{});assert.equal(r.issued[0].status,'ISSUED');});
 // Independent fixture from `shortage`/`empty` above: those were already
 // resolved by the restock-then-retry test (correctly, per the DCMS-043
 // fix), so `empty` is no longer UNAVAILABLE by this point - substituting
 // against an already-fulfilled line is rightly rejected, not what this
 // scenario is testing. A fresh unresolved shortage isolates the two
 // concerns.
 const shortage2=await fixture(),empty2=await item(0);await profile(shortage2,empty2);await ok(supplies(shortage2)+'/confirm-issue',{});
 const sub1=await item(),sub2=await item();
 await test(4,'Substitution records link and reason',async()=>{const r=await ok(supplies(shortage2)+'/substitute',{originalItemId:empty2.id,substituteItemId:sub1.id,quantity:2,reason:'test substitution'});assert.equal(r.substituteForItemId,empty2.id);assert.equal(await balance(sub1),8);});
 await test(4,'Already replaced shortage rejects a second substitute',async()=>rejected(await req(supplies(shortage2)+'/substitute',{originalItemId:empty2.id,substituteItemId:sub2.id,quantity:2,reason:'second substitution'})));
 const cancelled=await fixture('CANCELLED'),ci=await item();await profile(cancelled,ci);
 await test(4,'Cancelled schedule cannot consume stock',async()=>rejected(await req(supplies(cancelled)+'/confirm-issue',{})));
 const scarce=await item(1),a=await fixture(),b=await fixture();await profile(a,scarce,1);await profile(b,scarce,1);
 await test(4,'Concurrent sessions cannot overdraw stock',async()=>{await Promise.all([ok(supplies(a)+'/confirm-issue',{}),ok(supplies(b)+'/confirm-issue',{})]);assert.equal(await balance(scarce),0);assert.equal(await db.sessionSupplyIssueItem.count({where:{itemId:scarce.id,status:'ISSUED'}}),1);});
 // Separate machines per scenario; set up unavailable fixtures directly in test DB.
 await test(5,'Unauthenticated machine listing is 401',async()=>assert.equal((await req('/machines',undefined,null)).code,401));
 const ordinary=await machine(),protectedM=await machine({isProtected:true});
 const excluded=[];for(const status of ['OUT_OF_SERVICE','CLEANING','IN_USE','MAINTENANCE','RESERVED'])excluded.push(await machine({status}));
 const auto=await fixture();
 await test(5,'Auto assignment selects ordinary and excludes blocked machines',async()=>{const r=await ok(session(auto)+'/assign-machine',{});assert.equal(r.machine.id,ordinary.id);});
 const approvalF=await fixture();let approval;
 await test(5,'Protected fallback requests approval without assigning',async()=>{const r=await ok(session(approvalF)+'/assign-machine',{});approval=r.approval;assert.equal(approval.decision,'PENDING');assert.equal((await db.dialysisSchedule.findUnique({where:{id:approvalF.s.id}})).machineId,null);});
 await test(5,'Unauthorized approval decision is 403',async()=>assert.equal((await req('/approvals/'+approval.id+'/decision',{decision:'APPROVED'},denied)).code,403));
 await test(5,'Authorized approval assigns and records decider',async()=>{const r=await ok('/approvals/'+approval.id+'/decision',{decision:'APPROVED'});assert.equal(r.decidedById,actor.id);});
 const clean=await machine({status:'WAITING_CLEANING'});
 await test(5,'Cleaning may not be skipped',async()=>rejected(await req('/machines/'+clean.id+'/status',{status:'AVAILABLE',reason:'skip'})));
 const m=await machine({isProtected:true}),f1=await fixture(),f2=await fixture();
 const ap1=await ok('/approvals/machine-usage',{scheduleId:f1.s.id,machineId:m.id,reason:'first'});
 const ap2=await ok('/approvals/machine-usage',{scheduleId:f2.s.id,machineId:m.id,reason:'second'});
 await ok('/approvals/'+ap1.id+'/decision',{decision:'APPROVED'});
 await test(5,'Second pending approval cannot allocate reserved machine twice',async()=>rejected(await req('/approvals/'+ap2.id+'/decision',{decision:'APPROVED'})));
 const mr=await machine({isProtected:true}),r1=await fixture(),r2=await fixture();
 const ar1=await ok('/approvals/machine-usage',{scheduleId:r1.s.id,machineId:mr.id,reason:'first'}),ar2=await ok('/approvals/machine-usage',{scheduleId:r2.s.id,machineId:mr.id,reason:'second'});
 await ok('/approvals/'+ar1.id+'/decision',{decision:'APPROVED'});
 await test(5,'Rejecting other request must not release assigned machine',async()=>{await ok('/approvals/'+ar2.id+'/decision',{decision:'REJECTED'});assert.equal((await db.machine.findUnique({where:{id:mr.id}})).status,'RESERVED');});
 const before=await fixture();const earlyMachine=await machine();
 await ok(session(before)+'/assign-machine',{machineId:earlyMachine.id,reason:'phase5 first'});await ok(session(before)+'/pre-dialysis',pre);await ok(session(before)+'/confirm-supplies-ready',{});
 await test(6,'Early phase5 assignment is adopted by phase6 session',async()=>assert.equal((await ok(session(before))).session.status,'ASSIGNED'));
 const missing=await fixture();await ok(session(missing)+'/pre-dialysis',pre);const missingItem=await item(0);await profile(missing,missingItem);await ok(supplies(missing)+'/confirm-issue',{});
 await test(6,'UNAVAILABLE supplies prevent readiness',async()=>rejected(await req(session(missing)+'/confirm-supplies-ready',{})));
 await test(6,'Start without assignment is rejected',async()=>rejected(await req(session(missing)+'/start',start)));
 const complete=await prepared();
 await test(6,'Warehouse cannot start dialysis',async()=>assert.equal((await req(session(complete)+'/start',start,denied)).code,403));
 await test(6,'Incomplete start DTO returns 400',async()=>assert.equal((await req(session(complete)+'/start',{})).code,400));
 await test(6,'Start sets IN_DIALYSIS and machine IN_USE',async()=>{assert.equal((await ok(session(complete)+'/start',start)).status,'IN_DIALYSIS');assert.equal((await db.machine.findUnique({where:{id:complete.m.id}})).status,'IN_USE');});
 let reading;
 await test(6,'Reading and amendment retain original and audit',async()=>{reading=await ok(session(complete)+'/readings',{bp:'120/80',pulse:70,uf:1});const amended=await ok(session(complete)+'/readings/'+reading.id+'/amend',{bp:'125/80',pulse:72,reason:'correction'});assert.equal(amended.amendedFromId,reading.id);assert.equal((await db.dialysisReading.findUnique({where:{id:reading.id}})).pulse,70);assert.equal(await db.auditLog.count({where:{entityId:amended.id,action:'DIALYSIS_READING_AMENDED'}}),1);});
 await test(6,'Hypotension event reaches timeline',async()=>{await ok(session(complete)+'/events',{type:'HYPOTENSION',note:'synthetic'});assert.equal(await db.patientTimelineEvent.count({where:{patientId:complete.p.id,type:'DIALYSIS_EVENT_HYPOTENSION'}}),1);});
 await test(6,'Future-dated reading is rejected',async()=>rejected(await req(session(complete)+'/readings',{bp:'120/80',pulse:70,time:'2099-01-01T00:00:00Z'})));
 await test(6,'Negative pulse/UF reading is rejected',async()=>rejected(await req(session(complete)+'/readings',{bp:'not-a-pressure',pulse:-1,uf:-2})));
 const replacement=await machine();
 await test(6,'Reassignment retains readings/events and faults old machine',async()=>{const c=await db.dialysisReading.count({where:{sessionId:reading.sessionId}});await ok(session(complete)+'/reassign-machine',{newMachineId:replacement.id,reason:'fault'});assert.equal(await db.dialysisReading.count({where:{sessionId:reading.sessionId}}),c);assert.equal((await db.machine.findUnique({where:{id:complete.m.id}})).status,'OUT_OF_SERVICE');});
 await test(6,'End completes and sends machine to cleaning queue',async()=>{const r=await ok(session(complete)+'/end',end);assert.equal(r.status,'COMPLETED');assert.equal(typeof r.actualDurationMinutes,'number');assert.equal((await db.machine.findUnique({where:{id:replacement.id}})).status,'WAITING_CLEANING');});
 await test(6,'Completed session rejects new readings',async()=>rejected(await req(session(complete)+'/readings',{bp:'120/80',pulse:70})));
 await test(6,'Cleaning sequence and discharge succeed',async()=>{await ok('/machines/'+replacement.id+'/status',{status:'CLEANING',reason:'start cleaning'});await ok('/machines/'+replacement.id+'/status',{status:'AVAILABLE',reason:'finished'});assert.equal((await ok(session(complete)+'/discharge',{})).status,'DISCHARGED');});
 const bypass=await running(),emergency=await machine({isProtected:true,isEmergencyDedicated:true});
 await test(6,'Limited nurse cannot bypass protected emergency pool via reassign',async()=>rejected(await req(session(bypass)+'/reassign-machine',{newMachineId:emergency.id,reason:'fault'},nurse)));
 const stopped=await running();await ok(session(stopped)+'/interrupt',{reason:'fault'});
 await test(6,'Interrupted session has an end/recovery path',async()=>{const r=await req(session(stopped)+'/end',end);assert.ok(r.code<300,'End after interruption returned '+r.code);});
 const badNurse=await prepared();
 await test(6,'Non-clinical user cannot be attributed as nurse',async()=>rejected(await req(session(badNurse)+'/start',{...start,nurseId:denied.id})));
 const invalid=await fixture();
 await test(6,'Negative pre-weight must be rejected',async()=>rejected(await req(session(invalid)+'/pre-dialysis',{...pre,weight:-10})));
 await test(5,'Manual assignment requires reason',async()=>{const f=await fixture(),m=await machine();assert.equal((await req(session(f)+'/assign-machine',{machineId:m.id})).code,400);});
 await test(5,'Ward endpoints list 20/20/19 machine fixtures with exact states',async()=>{
   for(const count of [20,20,19]){const w=await db.ward.create({data:{name:randomUUID()}});const ids=[];for(let n=0;n<count;n++){const m=await db.machine.create({data:{machineCode:randomUUID(),wardId:w.id,status:n%2?'CLEANING':'AVAILABLE'}});ids.push(m);}
     const rows=await ok('/wards/'+w.id+'/machines');assert.equal(rows.length,count);for(const row of rows)assert.equal(row.status,ids.find(m=>m.id===row.id).status);
   }
 });
 await test(6,'Readings list is chronological and amendment without reason is rejected',async()=>{
   const rows=await ok(session(complete)+'/readings');for(let n=1;n<rows.length;n++)assert.ok(new Date(rows[n-1].time)<=new Date(rows[n].time));
   assert.equal((await req(session(complete)+'/readings/'+reading.id+'/amend',{bp:'120/80',pulse:70})).code,400);
 });
}
main().catch(e=>{console.error(e);process.exitCode=2;}).finally(async()=>{if(app)await app.close();await db.$disconnect();const summary={suite:'Phases 4,5,6',passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};fs.writeFileSync(path.resolve(__dirname,'../../../docs/PHASE456-TEST-RESULTS.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({passed:summary.passed,failed:summary.failed}));if(summary.failed&&!process.exitCode)process.exitCode=1;});
