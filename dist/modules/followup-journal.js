(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeskModules.register(factory());})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
return {id:'followup-journal',apiVersion:1,title:'跟进结果回看',description:'按职位回看实际跟进结果，包括完成和改期后的历史记录。',render({state,jobId}){
 const job=state.jobs.find(j=>j.id===jobId)||state.jobs[0];
 if(!job)return '<div class="empty">先建立职位并记录跟进结果。</div>';
 const notes=(state.followups||[]).filter(n=>n.job_id===job.id).sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
 return '<section class="panel"><div class="doc"><h3>跟进结果回看</h3><select id="review-job" aria-label="回看职位">'+state.jobs.map(j=>'<option value="'+esc(j.id)+'" '+(j.id===job.id?'selected':'')+'>'+esc(j.title)+(j.status==='closed'?'（已关闭）':'')+'</option>').join('')+'</select><p>共 '+notes.length+' 条人工记录，不代表已发出消息或已完成事项。</p>'+(notes.length?notes.map(n=>{const c=state.commitments.find(c=>c.id===n.commitment_id);return '<article class="note-block"><strong>'+esc(n.occurred_on)+'</strong> · 记录时别名：'+esc(n.person_alias||'内部事项')+'<p class="followup-text">'+esc(n.note)+'</p><small>所属事项：'+esc(c?.action_text||'原事项不可用')+(c?.status==='rescheduled'?'（改期历史）':'')+'</small><br><button class="button-link" data-action="detail" data-id="'+esc(n.commitment_id)+'">打开原事项及整条跟进记录 →</button></article>';}).join(''):'<p>暂无跟进结果。打开事项详情即可录入。</p>')+'</div></section>';
}};
});
