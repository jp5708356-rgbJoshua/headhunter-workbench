(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../core.js'));else root.DeskModules.register(factory(root.DeskCore));})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
return {id:'reminder-queue',apiVersion:1,title:'内部回看提醒',description:'只列内部回看日已到的未完成事项；不把回看日当作对方承诺期限。',render({state,asof}){
 const rows=C.reminders(state,asof),byId=new Map(state.jobs.map(j=>[j.id,j]));
 return '<section class="panel"><div class="doc"><h3>内部回看提醒 · '+rows.length+' 项</h3><p>评估日 '+esc(asof)+'。这是你安排的回看日，不代表 HR 未履约或候选人失信。提醒与待办是同一条记录，不重复计数；关闭页面后不主动通知。</p>'+(rows.length?rows.map(c=>{const j=byId.get(c.job_id);return '<div class="note-block"><strong>'+esc(c.person_alias||'内部待办')+'</strong> · '+esc(j?.title||'未知职位')+(j?.status==='closed'?' · 职位已关闭':'')+'<br>'+esc(c.action_text)+'<br>内部回看日：'+esc(c.reminder_on)+'<br>'+esc(c.condition_state==='waiting'?'仍在等待：'+c.condition_note:c.due_confirmed?'对方承诺期限：'+c.due_date:'对方期限尚未确认')+'<br><button class="button-link" data-action="detail" data-id="'+esc(c.id)+'">核对并处理原记录 →</button></div>';}).join(''):'<div class="empty"><strong>没有已到内部回看日的事项</strong>可在事项详情设置一个回看日，也可留空。</div>')+'</div></section>';
}};
});
