(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./data.js'));else root.DeskStorage=factory(root.DeskData);})(typeof globalThis!=='undefined'?globalThis:this,function(D){
'use strict';
// Single-key state writes are atomic. Web Locks in app.js serialize cooperating tabs.
// This adapter is deliberately independent from the DOM for failure-path testing.
function create(storage,key){
 const recoveryKey=key+'.recovery';
 function read(){
  let raw;try{raw=storage.getItem(key);}catch{throw Error('浏览器拒绝读取本地数据，未覆盖任何记录');}
  if(raw===null)return null;
  try{return D.validate(JSON.parse(raw));}catch(e){throw Error('本地数据无法验证：'+e.message+'。原始数据已保留，请到数据管理导出原始文件或恢复备份');}
 }
 function raw(){return storage.getItem(key);}
 function previous(){
  let value=storage.getItem(recoveryKey);if(!value)throw Error('没有可恢复的上一次保存');
  return D.validate(JSON.parse(value));
 }
 function write(input,expectedRaw){
  const clean=D.validate(input),serialized=JSON.stringify(clean);
  let old;
  try{
   old=storage.getItem(key);
   if(expectedRaw!==undefined&&old!==expectedRaw)throw Error('数据已被其他页面修改，请刷新后重试');
   // Persist the previous state before touching the current value.
   if(old!==null){
    // Never replace a known recovery point with unreadable/corrupt input.
    let oldValid=false;try{D.validate(JSON.parse(old));oldValid=true;}catch{}
    if(oldValid)storage.setItem(recoveryKey,old);
   }
   storage.setItem(key,serialized);
  }catch(e){
   if(/其他页面/.test(e.message))throw e;
   throw Error('保存失败，当前操作未写入：本地空间不足或浏览器禁止存储。请导出数据并重试');
  }
  return clean;
 }
 return {read,raw,write,previous,recoveryKey};
}
return {create};
});
