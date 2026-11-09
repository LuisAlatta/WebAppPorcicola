import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import worker from '../worker/index';

export async function healthFixture(name:string){
  const runtime=new Miniflare({workers:[{config:{name,compatibilityDate:'2026-07-01',manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}},modulesRoot:'/'},env:{DB:{type:'d1',id:name}}}}]});
  const db=await runtime.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(file=>/^\d+.*\.sql$/.test(file)).sort()){
    const sql=(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\s+/g,' ');let trigger='';
    for(const part of sql.split(';').map(part=>part.trim()).filter(Boolean)){if(trigger||/^CREATE TRIGGER/i.test(part)){trigger+=`${part}; `;if(/\bEND$/i.test(part)){await db.prepare(trigger.trim()).run();trigger='';}}else await db.prepare(part).run();}
  }
  let token='';
  const api=(path:string,body?:Record<string,unknown>,method=body?'POST':'GET')=>worker.fetch(new Request(`http://localhost${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:db});
  const boot=await api('/api/auth/bootstrap',{username:`${name}@granja.test`,password:'PasswordPrueba2026!',name:'Admin'});
  if(boot.status!==201)throw new Error(await boot.text());token=(await boot.json() as {token:string}).token;
  const addAnimal=async(code:string)=>{
    const response=await api('/api/animals',{code,animalType:'verraco',sex:'macho',entryDate:'2026-01-01',entryStageCode:'engorde',barnId:1,originType:'inicial',reason:'Alta de prueba sanitaria',operationKey:`animal-${code}`});
    if(response.status!==201)throw new Error(await response.text());
    return (await db.prepare('SELECT id FROM animals WHERE code=?').bind(code).first<{id:number}>())!.id;
  };
  return{runtime,db,api,addAnimal};
}
