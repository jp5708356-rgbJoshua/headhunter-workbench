(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeskModules=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const modules=new Map();
function register(module){
 if(!module||module.apiVersion!==1||!/^[a-z][a-z0-9-]{0,50}$/.test(module.id)||typeof module.title!=='string'||typeof module.render!=='function')throw Error('扩展模块接口无效');
 if(modules.has(module.id))throw Error('扩展模块重复：'+module.id);
 modules.set(module.id,Object.freeze({...module}));
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
function render(id,context){const m=modules.get(id);if(!m)throw Error('扩展模块未安装');return m.render(freeze(JSON.parse(JSON.stringify(context))));}
function list(){return [...modules.values()].map(({id,title,description})=>({id,title,description}));}
return {register,render,list};
});
