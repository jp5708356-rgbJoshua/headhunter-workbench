(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.DeskData=factory(root.DeskCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const VERSION=4, BACKUP_VERSION=1, MAX_BYTES=10*1024*1024;
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x);
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(x)&&C.validDate(x.slice(0,10))&&Number.isFinite(Date.parse(x));
function assert(ok,message){if(!ok)throw Error(message);}
function scan(value,depth=0){
 assert(depth<30,'数据层级过深');
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='number'){assert(Number.isFinite(value),'数据含无效数字');return;}
 if(typeof value==='string'){assert(value.length<=20000,'数据字段过长');return;}
 assert(typeof value==='object','数据类型无效');
 for(const k of Object.keys(value)){assert(!['__proto__','constructor','prototype'].includes(k),'数据含不允许的属性');scan(value[k],depth+1);}
}
function string(x,label,max=1200,required=false){assert(typeof x==='string'&&x.length<=max&&(!required||x.trim()),label+'无效');}
function nullableText(x,label,max){if(x!==null&&x!==undefined)string(x,label,max);}
function unique(rows,label){assert(Array.isArray(rows)&&rows.length<=20000,label+'列表无效或数量超限');const ids=new Set();for(const r of rows){assert(record(r)&&id(r.id)&&!ids.has(r.id),label+'编号无效或重复');ids.add(r.id);}return ids;}
function validate(input){
 assert(record(input),'工作区数据无效');scan(input);
 assert(input.schema_version===1,'不支持的工作区结构版本');
 assert(input.data_version===undefined||[1,2,3,4].includes(input.data_version),'数据来自更高版本，请先升级工具');
 const s=C.clone(input);if(s.followups===undefined)s.followups=[];unique(s.followups,'跟进记录');
 assert(id(s.tenant_id),'工作区编号无效');
 assert(s.dataset_kind===undefined||['work','demo'].includes(s.dataset_kind),'工作区类型无效');
 const users=unique(s.users,'负责人'),jobs=unique(s.jobs,'职位'),commitments=unique(s.commitments,'事项');
 unique(s.changes,'变化');unique(s.logs,'日志');
 assert(users.size>0,'至少需要一位负责人');
 for(const u of s.users)string(u.alias,'负责人别名',80,true);
 assert(Number.isSafeInteger(s.mutation_seq)&&s.mutation_seq>=0,'数据修订号无效');
 for(const j of s.jobs){
  assert(j.tenant_id===s.tenant_id&&users.has(j.owner_id),'职位归属无效');
  assert(['open','closed'].includes(j.status),'职位状态无效');
  string(j.title,'职位名称',160,true);string(j.client_alias,'客户别名',100,true);
  assert(timestamp(j.created_at)&&timestamp(j.updated_at),'职位时间无效');
  assert(j.cleanup_due_on===null||j.cleanup_due_on===undefined||C.validDate(j.cleanup_due_on),'清理日期无效');
 }
 const parentCounts=new Map(),byId=new Map(s.commitments.map(c=>[c.id,c]));
 for(const c of s.commitments){
  assert(c.tenant_id===s.tenant_id&&jobs.has(c.job_id)&&users.has(c.created_by)&&users.has(c.assigned_to),'事项归属无效');
  string(c.action_text,'事项内容',1200,true);nullableText(c.person_alias,'对接人别名',80);nullableText(c.source_note,'来源',300);nullableText(c.due_raw,'原始日期',100);nullableText(c.condition_note,'等待内容',500);
  assert(C.validDate(c.source_date),'沟通日期无效');
  assert(c.reminder_on===undefined||c.reminder_on===null||C.validDate(c.reminder_on),'内部回看日期无效');
  c.reminder_on=c.reminder_on||null;
  assert(['pending','done','cancelled','rescheduled'].includes(c.status),'事项状态无效');
  assert(['definite','conditional','tentative','request'].includes(c.modality),'事项语气无效');
  assert(['not_applicable','waiting','released'].includes(c.condition_state),'等待状态无效');
  assert(typeof c.due_confirmed==='boolean','日期确认状态无效');
  assert(c.due_date===null||C.validDate(c.due_date),'截止日期无效');
  assert(!c.due_confirmed||C.validDate(c.due_date),'已确认日期缺失');
  if(c.condition_state==='waiting')assert(!c.due_date&&!c.due_confirmed&&c.modality==='conditional'&&c.condition_note?.trim(),'等待条件不完整或带有生效期限');
  if(c.modality==='conditional')assert(c.condition_state!=='not_applicable','条件型承诺缺少等待状态');
  assert(timestamp(c.created_at)&&timestamp(c.updated_at),'事项时间无效');
  assert(c.status!=='done'||timestamp(c.completed_at),'完成时间缺失');
  assert(c.completed_at===null||c.completed_at===undefined||timestamp(c.completed_at),'完成时间无效');
  if(c.rescheduled_from){
   const p=byId.get(c.rescheduled_from);
   assert(p&&p.id!==c.id&&p.status==='rescheduled'&&p.job_id===c.job_id&&p.tenant_id===c.tenant_id,'改期父记录无效');
   parentCounts.set(p.id,(parentCounts.get(p.id)||0)+1);assert(parentCounts.get(p.id)===1,'同一事项存在多个改期后继');
  }
 }
 for(const c of s.commitments){
  if(c.status==='rescheduled')assert(parentCounts.get(c.id)===1,'改期历史缺少后继');
  const seen=new Set();let at=c;
  while(at){assert(!seen.has(at.id),'改期记录存在循环');seen.add(at.id);at=byId.get(at.rescheduled_from);}
 }
 for(const c of s.changes){
  assert(c.tenant_id===s.tenant_id&&jobs.has(c.job_id)&&users.has(c.created_by),'变化记录归属无效');
  string(c.description,'变化内容',1200,true);nullableText(c.source_note,'变化来源',300);nullableText(c.status_note,'作废说明',300);
  assert(C.validDate(c.happened_on)&&timestamp(c.created_at)&&timestamp(c.updated_at),'变化时间无效');
  assert(['active','void','superseded'].includes(c.status),'变化状态无效');
  assert(['unknown','not_started','some_synced','not_applicable'].includes(c.sync_status),'同步状态无效');
 }
 for(const n of s.followups){
  const c=byId.get(n.commitment_id);assert(c&&n.tenant_id===s.tenant_id&&n.job_id===c.job_id&&users.has(n.created_by),'跟进记录归属无效');
  string(n.note,'跟进结果',800,true);nullableText(n.person_alias,'记录时别名',80);
  assert(C.validDate(n.occurred_on)&&timestamp(n.created_at)&&timestamp(n.updated_at),'跟进记录时间无效');
  assert(['preserve','set','clear'].includes(n.review_mode),'跟进回看安排无效');
  assert(n.review_mode==='set'?C.validDate(n.review_date):n.review_date===null,'跟进记录中的回看日期无效');
 }
 for(const l of s.logs){assert(timestamp(l.occurred_at)&&users.has(l.actor_id),'操作日志无效');string(l.event_type,'操作类型',100,true);if(l.record_id!==undefined)assert(id(l.record_id),'日志关联编号无效');}
 if(s.extension_data!==undefined)assert(record(s.extension_data),'扩展数据无效');
 s.data_version=VERSION;s.extension_data=s.extension_data||{};
 s.dataset_kind=s.dataset_kind||(s.tenant_id==='tenant-synthetic-001'?'demo':'work');
 return s;
}
function emptyWorkspace(uid,tenant,alias='我'){
 assert(id(uid)&&id(tenant),'工作区初始化编号无效');string(alias,'负责人别名',80,true);
 return validate({schema_version:1,data_version:VERSION,dataset_kind:'work',tenant_id:tenant,users:[{id:uid,alias}],jobs:[],changes:[],commitments:[],logs:[],mutation_seq:0,extension_data:{}});
}
function summary(s){return {workspace:s.dataset_kind,users:s.users.length,jobs:s.jobs.length,changes:s.changes.length,commitments:s.commitments.length,active:s.commitments.filter(c=>c.status==='pending').length};}
async function sha256(text,cryptoObject){
 const api=cryptoObject||globalThis.crypto;
 assert(api?.subtle,'当前浏览器不支持备份校验，请使用近期版本的桌面浏览器或本机服务');
 const digest=await api.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
async function backup(state,now,cryptoObject){
 const clean=validate(state);assert(timestamp(now),'备份时间无效');
 const payload=JSON.stringify(clean);
 return {format:'headhunter-workbench-backup',backup_version:BACKUP_VERSION,created_at:now,app_version:'0.7.0',sha256:await sha256(payload,cryptoObject),state:clean};
}
async function readBackup(text,cryptoObject){
 assert(typeof text==='string'&&new TextEncoder().encode(text).length<=MAX_BYTES,'备份文件超出 10 MB 限制');
 let b;try{b=JSON.parse(text);}catch{throw Error('文件不是有效 JSON 备份');}
 scan(b);assert(record(b)&&b.format==='headhunter-workbench-backup'&&b.backup_version===BACKUP_VERSION,'不是受支持的完整备份文件');
 assert(timestamp(b.created_at),'备份时间无效');
 assert(typeof b.sha256==='string'&&b.sha256===await sha256(JSON.stringify(b.state),cryptoObject),'备份校验失败：文件内容已变化，请使用原始备份');
 return {state:validate(b.state),created_at:b.created_at};
}
function preferences(raw){let p;try{p=JSON.parse(raw||'{}');}catch{return {};}if(!record(p))return {};const out={};if(['work','demo'].includes(p.mode))out.mode=p.mode;if(id(p.actor))out.actor=p.actor;if(C.validDate(p.asof))out.asof=p.asof;if(['live','fixed'].includes(p.clockMode))out.clockMode=p.clockMode;return out;}
return {preferences,VERSION,MAX_BYTES,validate,emptyWorkspace,summary,backup,readBackup,sha256};
});
