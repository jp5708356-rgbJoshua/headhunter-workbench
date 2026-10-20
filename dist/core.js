(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeskCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VIEWS=['overdue','due_today','upcoming','undated','waiting_condition','done','cancelled','rescheduled'];
const clone=x=>JSON.parse(JSON.stringify(x));
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(new Date(x+'T00:00:00Z').valueOf())&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function dayAdd(d,n){if(!validDate(d))throw Error('请填写有效的沟通日期');let v=new Date(d+'T00:00:00Z');v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);}
const weekday=d=>(new Date(d+'T00:00:00Z').getUTCDay()+6)%7;
function localToday(){return localDateFrom(new Date().toISOString());}
function view(c,today){if(!validDate(today))throw Error('评估日期无效');if(c.status!=='pending')return c.status;if(c.condition_state==='waiting')return 'waiting_condition';if(!c.due_confirmed||!c.due_date)return 'undated';return c.due_date<today?'overdue':c.due_date===today?'due_today':'upcoming';}
function partitions(s,today){return Object.fromEntries(VIEWS.map(k=>[k,s.commitments.filter(c=>view(c,today)===k)]));}
function seed(raw){return {schema_version:1,tenant_id:raw.auth_fixtures.tenant_id,users:clone(raw.auth_fixtures.consultants),jobs:clone(raw.jobs),changes:clone(raw.change_logs),commitments:clone(raw.commitments),logs:[],mutation_seq:0};}
function canEdit(s,r,actor){let j=s.jobs.find(x=>x.id===r.job_id);return !!j&&r.tenant_id===s.tenant_id&&s.users.some(u=>u.id===actor)&&(j.owner_id===actor||r.created_by===actor||r.assigned_to===actor);}
function findJob(s,id){let j=s.jobs.find(x=>x.id===id&&x.tenant_id===s.tenant_id);if(!j)throw Error('该职位不存在或不属于当前工作区');return j;}
function text(value,label,max,required){let t=String(value??'').trim();if(required&&!t)throw Error('请填写'+label);if(t.length>max)throw Error(label+'过长，请保留必要信息');if(/(?:\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(t))throw Error('请使用别名，移除电话和邮箱后再保存');return t;}
function dueFields(p){let state=p.condition_state||'not_applicable',mod=p.modality||'definite';if(!['definite','conditional','tentative','request'].includes(mod))throw Error('承诺语气无效');if(!['not_applicable','waiting','released'].includes(state))throw Error('条件状态无效');let note=text(p.condition_note,'等待条件',500,false);if(mod==='conditional'&&state==='not_applicable')throw Error('条件型承诺必须明确等待或已解除状态');if(state==='waiting'){if(!note)throw Error('请写清楚在等待谁、哪件事');return {modality:'conditional',condition_state:state,condition_note:note,due_date:null,due_confirmed:false};}let due=p.due_date||null,confirmed=p.due_confirmed===true;if(due&&!validDate(due))throw Error('截止日期无效');if(confirmed&&!due)throw Error('确认期限前请先选择日期');return {modality:mod,condition_state:state,condition_note:note||null,due_date:due,due_confirmed:confirmed};}
function verifyExpected(row,op){if(row.updated_at!==op.expected_updated_at)throw Error('这条记录已被修改，请刷新后再操作');}
function stampFor(row,now){let ms=Date.parse(now);if(!isFinite(ms))throw Error('操作时间无效');if(row&&row.updated_at)ms=Math.max(ms,Date.parse(row.updated_at)+1);return new Date(ms).toISOString();}
function createRow(s,p,id,actor,now){let j=findJob(s,p.job_id);if(j.owner_id!==actor)throw Error('请切换为该职位的模拟负责人再录入');if(!validDate(p.source_date))throw Error('请确认沟通发生日期');if(!s.users.some(x=>x.id===p.assigned_to))throw Error('请选择工作区内的跟进负责人');let person=text(p.person_alias,'承诺人',80,false)||null;return {id,job_id:j.id,tenant_id:s.tenant_id,person_alias:person,action_text:text(p.action_text,'事项',1200,true),source_note:text(p.source_note,'来源备注',300,false),source_date:p.source_date,assigned_to:p.assigned_to,due_raw:text(p.due_raw,'原始日期',100,false)||null,reminder_on:reminderDate(p.reminder_on),...dueFields(p),status:'pending',rescheduled_from:null,created_by:actor,created_at:now,updated_at:now,completed_at:null};}
function reminderDate(value){if(value===null||value===undefined||value==='')return null;if(!validDate(value))throw Error('内部回看日期无效');return value;}
function reminders(s,today){if(!validDate(today))throw Error('评估日期无效');return s.commitments.filter(c=>c.status==='pending'&&c.reminder_on&&c.reminder_on<=today).sort((a,b)=>a.reminder_on.localeCompare(b.reminder_on)||a.id.localeCompare(b.id));}
function contactContext(s,jobId,person=null){const jobs=s.jobs.filter(j=>j.id===jobId);return {job:jobs[0]||null,tasks:s.commitments.filter(c=>c.job_id===jobId&&c.status==='pending'&&(person===null||(c.person_alias||'')===person)),changes:s.changes.filter(c=>c.job_id===jobId&&c.status==='active').sort((a,b)=>b.happened_on.localeCompare(a.happened_on))};}
function chainIds(s,cid){const target=s.commitments.find(c=>c.id===cid);if(!target)return [];const rows=s.commitments.filter(c=>c.job_id===target.job_id&&c.tenant_id===target.tenant_id),ids=new Set([cid]);let changed=true;while(changed){changed=false;for(const c of rows){if(c.rescheduled_from&&(ids.has(c.id)||ids.has(c.rescheduled_from))){for(const id of [c.id,c.rescheduled_from])if(!ids.has(id)&&rows.some(r=>r.id===id)){ids.add(id);changed=true;}}}}return [...ids];}
function commitmentNotes(s,cid){const ids=new Set(chainIds(s,cid));return (s.followups||[]).filter(n=>ids.has(n.commitment_id)).sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));}
function validFollowupDate(value,now){if(!validDate(value)||value>localDateFrom(now))throw Error('跟进发生日必须为有效日期，且不能晚于今天');return value;}
function sameCreation(a,b){const omit=['created_at','updated_at'];return Object.keys(b).filter(k=>!omit.includes(k)).every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));}
function apply(s,op,actor,now){if(!op||typeof op.type!=='string'||typeof op.id!=='string'||!/[A-Za-z0-9]/.test(op.id)||!Number.isFinite(Date.parse(now)))throw Error('操作编号或时间无效');if(!s.users.some(x=>x.id===actor))throw Error('模拟顾问身份无效');if(op.tenant_id!==s.tenant_id)throw Error('工作区不匹配');let next=clone(s),resultId=op.id;next.followups=next.followups||[];
if(op.type==='record_followup'){
 const row=next.commitments.find(c=>c.id===op.commitment_id);if(!row||!canEdit(next,row,actor))throw Error('无权记录该事项的跟进');
 const p=op.payload||{},mode=p.review_mode||'preserve';if(!['preserve','set','clear'].includes(mode))throw Error('下次回看安排无效');
 const reviewDate=mode==='set'?reminderDate(p.reminder_on):null;if(mode==='set'&&!reviewDate)throw Error('请选择下次内部回看日');if(mode!=='set'&&p.reminder_on)throw Error('保留或清除回看日时不应另填日期');
 const note={id:op.id,tenant_id:s.tenant_id,job_id:row.job_id,commitment_id:row.id,person_alias:row.person_alias||null,occurred_on:validFollowupDate(p.occurred_on,now),note:text(p.note,'跟进结果',800,true),review_mode:mode,review_date:reviewDate,created_by:actor,created_at:now,updated_at:now};
 const old=next.followups.find(n=>n.id===op.id);if(old){if(old.created_by!==actor||!sameCreation(old,note))throw Error('跟进保存标识冲突，请重新打开');return {state:next,id:old.id,replayed:true};}
 verifyExpected(row,op);if(row.status==='rescheduled')throw Error('请在最新改期条目上记录跟进');if(mode!=='preserve'&&row.status!=='pending')throw Error('已关闭事项只能补录结果，不能安排回看');
 next.followups.push(note);if(mode==='set')row.reminder_on=reviewDate;if(mode==='clear')row.reminder_on=null;row.updated_at=stampFor(row,now);
}else if(op.type==='edit_followup'||op.type==='delete_followup'){
 const note=next.followups.find(n=>n.id===op.id),row=note&&next.commitments.find(c=>c.id===note.commitment_id);if(!note||!row||note.created_by!==actor||!canEdit(next,row,actor))throw Error('只能由记录者修改自己有权操作的跟进记录');verifyExpected(note,op);
 if(op.type==='edit_followup'){note.note=text(op.payload.note,'跟进结果',800,true);note.occurred_on=validFollowupDate(op.payload.occurred_on,now);note.updated_at=stampFor(note,now);}else next.followups=next.followups.filter(n=>n.id!==note.id);
 row.updated_at=stampFor(row,now);
}else if(op.type==='create_job'){
 const p=op.payload,old=next.jobs.find(j=>j.id===op.id);
 const row={id:op.id,tenant_id:s.tenant_id,owner_id:actor,title:text(p.title,'职位名称',160,true),client_alias:text(p.client_alias,'客户别名',100,true),status:'open',created_at:now,updated_at:now,closed_at:null,cleanup_due_on:null};
 if(old){if(old.owner_id!==actor||!sameCreation(old,row))throw Error('职位保存标识冲突');return {state:next,id:old.id,replayed:true};}next.jobs.push(row);
}else if(op.type==='edit_job'){
 const j=findJob(next,op.id);if(j.owner_id!==actor)throw Error('只有该职位负责人可修改');verifyExpected(j,op);j.title=text(op.payload.title,'职位名称',160,true);j.client_alias=text(op.payload.client_alias,'客户别名',100,true);j.updated_at=stampFor(j,now);
}else if(op.type==='edit_commitment'){
 const row=next.commitments.find(c=>c.id===op.id);if(!row||!canEdit(next,row,actor))throw Error('无法修改该事项');verifyExpected(row,op);if(row.status!=='pending')throw Error('只能修改未完成事项');
 const p=op.payload;if(!validDate(p.source_date))throw Error('沟通日期无效');if(!next.users.some(u=>u.id===p.assigned_to))throw Error('跟进负责人无效');
 row.person_alias=text(p.person_alias,'承诺人',80,false)||null;row.action_text=text(p.action_text,'事项',1200,true);row.source_note=text(p.source_note,'来源',300,false);row.source_date=p.source_date;row.assigned_to=p.assigned_to;
 if(row.condition_state==='waiting')row.condition_note=text(p.condition_note,'等待条件',500,true);
 row.updated_at=stampFor(row,now);
}else if(op.type==='edit_change'){
 const row=next.changes.find(c=>c.id===op.id);if(!row||!canEdit(next,row,actor))throw Error('无法修改该变化');verifyExpected(row,op);if(row.status!=='active')throw Error('只能修改有效变化');
 if(!validDate(op.payload.happened_on))throw Error('发生日期无效');row.description=text(op.payload.description,'变化描述',1200,true);row.source_note=text(op.payload.source_note,'来源',300,false);row.happened_on=op.payload.happened_on;row.updated_at=stampFor(row,now);
}else if(op.type==='create_commitment'){
 let row=createRow(next,op.payload,op.id,actor,now),old=next.commitments.find(c=>c.id===op.id);if(old){if(!canEdit(next,old,actor)||!sameCreation(old,row))throw Error('保存标识冲突，请重新打开表单');return {state:next,id:old.id,replayed:true};}next.commitments.push(row);
}else if(op.type==='create_change'){
 let p=op.payload,j=findJob(next,p.job_id);if(j.owner_id!==actor)throw Error('请切换为该职位的模拟负责人再录入');if(!validDate(p.happened_on))throw Error('请选择变化发生日期');if(!['unknown','not_started','some_synced','not_applicable'].includes(p.sync_status))throw Error('同步状态无效');let row={id:op.id,tenant_id:s.tenant_id,job_id:j.id,description:text(p.description,'变化描述',1200,true),source_note:text(p.source_note,'来源',300,false),happened_on:p.happened_on,sync_status:p.sync_status,status:'active',status_note:null,created_by:actor,created_at:now,updated_at:now};let old=next.changes.find(c=>c.id===op.id);if(old){if(!canEdit(next,old,actor)||!sameCreation(old,row))throw Error('保存标识冲突');return {state:next,id:old.id,replayed:true};}next.changes.push(row);
}else if(op.type==='job_status'){
 let j=findJob(next,op.id);if(j.owner_id!==actor)throw Error('只有该职位负责人可更改状态');verifyExpected(j,op);if(!['open','closed'].includes(op.status))throw Error('职位状态无效');j.status=op.status;j.updated_at=stampFor(j,now);j.closed_at=op.status==='closed'?now:null;j.cleanup_due_on=op.status==='closed'?dayAdd(localDateFrom(now),30):null;
}else if(op.type.startsWith('change_')){
 let row=next.changes.find(c=>c.id===op.id);if(!row||!canEdit(next,row,actor))throw Error('无法修改该变化记录');verifyExpected(row,op);
 if(op.type==='change_sync'){if(!['unknown','not_started','some_synced','not_applicable'].includes(op.value))throw Error('同步状态无效');row.sync_status=op.value;}
 else if(op.type==='change_void'){row.status='void';row.status_note=text(op.note,'作废说明',300,true);}
 else if(op.type==='change_delete'){next.changes=next.changes.filter(x=>x.id!==op.id);}
 else throw Error('不支持的变化操作');row.updated_at=stampFor(row,now);
}else{
 let row=next.commitments.find(c=>c.id===op.id);if(!row||!canEdit(next,row,actor))throw Error('该事项仅允许其模拟负责人或创建者修改');verifyExpected(row,op);
 if(op.type==='delete_commitment'){
  if(row.rescheduled_from||next.commitments.some(c=>c.rescheduled_from===row.id))throw Error('该事项属于改期历史，请使用整条承诺链删除');next.commitments=next.commitments.filter(c=>c.id!==row.id);next.followups=next.followups.filter(n=>n.commitment_id!==row.id);
 }else if(op.type==='delete_chain'){
  let root=row;while(root.rescheduled_from)root=next.commitments.find(c=>c.id===root.rescheduled_from);let ids=new Set([root.id]),last=-1;while(last!==ids.size){last=ids.size;next.commitments.forEach(c=>{if(ids.has(c.rescheduled_from))ids.add(c.id);});}if(next.commitments.some(c=>ids.has(c.id)&&!canEdit(next,c,actor)))throw Error('无权删除整条记录链');next.commitments=next.commitments.filter(c=>!ids.has(c.id));next.followups=next.followups.filter(n=>!ids.has(n.commitment_id));
 }else{
  if(row.status!=='pending')throw Error('事项已关闭或已改期，请查看最新记录');
  if(op.type==='set_reminder'){row.reminder_on=reminderDate(op.reminder_on);}
  else if(op.type==='complete'){row.status='done';row.completed_at=now;}
  else if(op.type==='cancel'){row.status='cancelled';}
  else if(op.type==='release'){if(row.condition_state!=='waiting')throw Error('该事项没有等待条件');if(!op.due_date||!validDate(op.due_date)||op.due_confirmed!==true)throw Error('请重新确认条件满足后的截止日期');row.condition_state='released';row.reminder_on=null;row.due_date=op.due_date;row.due_confirmed=true;}
  else if(op.type==='confirm_date'){if(row.condition_state==='waiting')throw Error('请先核实并解除等待条件');if(!validDate(op.due_date)||op.due_confirmed!==true)throw Error('请确认具体截止日期');row.reminder_on=null;row.due_date=op.due_date;row.due_confirmed=true;}
  else if(op.type==='reschedule'){
   if(row.condition_state==='waiting')throw Error('请先核实条件是否满足');if(!validDate(op.due_date)||op.due_confirmed!==true)throw Error('请确认新的截止日期');if(!op.child_id||next.commitments.some(c=>c.id===op.child_id||c.rescheduled_from===row.id))throw Error('已存在改期记录，请刷新');let child={...clone(row),id:op.child_id,reminder_on:null,due_date:op.due_date,due_confirmed:true,due_raw:'改期至'+op.due_date,status:'pending',rescheduled_from:row.id,created_by:actor,created_at:now,updated_at:now,completed_at:null};row.status='rescheduled';next.commitments.push(child);resultId=child.id;
  }else throw Error('不支持的事项操作');row.updated_at=stampFor(row,now);
 }
}
next.mutation_seq++;next.logs.push({id:'event-'+next.mutation_seq,actor_id:actor,record_id:op.id,event_type:op.type,occurred_at:now});return {state:next,id:resultId,replayed:false};}
function localDateFrom(iso){let parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso)),v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return v.year+'-'+v.month+'-'+v.day;}
function dateDraft(raw,source){
 if(!validDate(source))return {dates:[],warning:'先确认沟通发生日期'};
 raw=String(raw||'').trim();if(!raw)return {dates:[],warning:'未提供期限，可保存为未定日期'};
 if(/如果|可能|不会|不保证|不一定|不承诺|暂不|先等|待.*确认|或者|或|至|到|改成|改为/.test(raw))return {dates:[],warning:'含条件、多个日期或不确定语气，请手动核实期限'};
 let d=null,m,boundary=/(?:之?前|之前)$/.test(raw),body=raw.replace(/(?:之前|前)$/,'').trim();
 if((m=body.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/)))d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 else if((m=body.match(/^(\d{1,2})月(\d{1,2})[日号]?$/))||(m=body.match(/^(\d{1,2})\/(\d{1,2})$/))){
  d=`${source.slice(0,4)}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if(!validDate(d))return {dates:[],warning:'日期无效，请核实年份和日期'};
  if(d<source){const next=`${Number(source.slice(0,4))+1}${d.slice(4)}`;return {dates:[d,...(validDate(next)?[next]:[])],warning:'原话没有年份，日期可能跨年或已过去，请核实',needsBoundary:boundary};}
 }
 else if(body==='后天')d=dayAdd(source,2);else if(body==='明天')d=dayAdd(source,1);else if(body==='今天')d=source;
 else if((m=body.match(/^(下周|这周|本周|周|星期)([一二三四五六日天])$/))){let w='一二三四五六日'.indexOf(m[2]==='天'?'日':m[2]),start=dayAdd(source,-weekday(source)),offset=m[1]==='下周'?7:0;d=dayAdd(start,offset+w);if((m[1]==='周'||m[1]==='星期')&&d<source)return {dates:[d,dayAdd(d,7)],warning:'周几存在当周或下周歧义，请选择',needsBoundary:boundary};}
 else if(body==='下周'){let start=dayAdd(source,7-weekday(source));return {dates:[],range:[start,dayAdd(start,6)],warning:'“下周”不是唯一日期，请选择具体一天'};}
 if(!d||!validDate(d))return {dates:[],warning:'无法得到唯一可信日期，请手动选择'};
 return {dates:[d],warning:boundary?'请确认“前”是否包含当天；候选日期尚未生效':'仅为候选日期，保存前请确认',needsBoundary:boundary};
}
function parseDraft(raw,source){raw=String(raw||'').trim();let people=Array.from(new Set(raw.match(/HR-?\d+|候选人C\d+|模拟顾问\d+/g)||[]));let negative=/不会|不保证|不一定|不承诺|不能|无法|不反馈|未承诺|暂不|先别|没有确认|尚未/.test(raw),conditional=/如果|等.{0,100}(后|确认|通过|获批)|待.{0,100}(后|确认)/.test(raw),dateTokens=raw.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}[日号]?|(?:下周|这周|本周|周|星期)[一二三四五六日天]?|明天|后天|今天/g)||[],complex=dateTokens.length>1||/或者|或|工资|月薪|年包|薪资|薪酬/.test(raw)||raw.length>150||raw.split('\n').filter(x=>x.trim()).length>2||people.length>1||negative||/忽略.*规则|导出.*联系方式/.test(raw);
let modality=conditional?'conditional':/请|麻烦|能否|希望/.test(raw)?'request':/可能|预计|暂定|尽量|争取|应该|估计/.test(raw)||negative?'tentative':'definite';if(['tentative','request'].includes(modality))complex=true;let person=people.length===1?people[0]:'';let action=raw.replace(/^[^：:\n]{1,24}[：:]/,'');let match=raw.match(/(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}[日号]?|下周[一二三四五六日天]?|(?:这周|本周|周|星期)[一二三四五六日天]|明天|后天|今天)(?:之前|前)?/);let dueRaw=match?match[0]:'';
return {person_alias:person,action_text:complex?'':action,due_raw:complex?'':dueRaw,modality,condition_state:conditional?'waiting':'not_applicable',condition_note:conditional?raw.slice(0,500):'',fallback:complex,warning:complex?'内容含多人、条件、否定或多个段落：规则不自动拆分，请选取一项手动补齐。':'已生成待确认表单；规则未理解全部上下文。',date:complex||conditional?{dates:[],warning:'请核实语气及条件后再确认日期'}:dateDraft(dueRaw,source)};}
function redact(t){return String(t).replace(/\b1[3-9]\d{9}\b/g,'[电话已隐藏]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[邮箱已隐藏]');}
return {VIEWS,clone,validDate,dayAdd,localToday,localDateFrom,view,partitions,seed,canEdit,apply,chainIds,commitmentNotes,reminders,contactContext,dateDraft,parseDraft,redact};
});
