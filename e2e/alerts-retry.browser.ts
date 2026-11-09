import {test,expect} from '@playwright/test';

test('crear aviso conserva la clave cuando el servidor guardó y se perdió la respuesta',async({page})=>{
 const bodies:Record<string,unknown>[]=[];
 const committed=new Set<string>();
 await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true,alerts:[],counts:{},barns:[{id:1,name:'Galpón A'}],notifications:[],unreadCount:0,rules:[]}}));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'administrador',username:'admin@prueba.pe'}}}));
 await page.route('**/api/alerts/manual',async route=>{
  const body=route.request().postDataJSON() as Record<string,unknown>;
  bodies.push(body);
  committed.add(String(body.operationKey));
  if(bodies.length===1){await route.abort('failed');return;}
  await route.fulfill({status:200,json:{ok:true,replayed:true,alert:{id:1,title:body.title}}});
 });

 await page.goto('/alertas');
 await expect(page.getByRole('banner').getByRole('button',{name:/Módulo actual: Alertas y Pendientes/})).toBeVisible();
 await page.getByRole('button',{name:'Crear aviso manual'}).click();
 await expect(page.getByRole('heading',{name:'Crear aviso manual de granja'})).toBeVisible();
 await page.getByLabel('Título o tarea').fill('Revisar bebedero');
 await page.getByLabel('Fecha prevista',{exact:true}).fill('2026-11-09');
 await page.getByLabel('Motivo de atención').fill('Inspección pendiente en galpón');
 await page.getByRole('button',{name:'Crear aviso de granja'}).click();
 await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
 await expect(page.getByLabel('Título o tarea')).toHaveValue('Revisar bebedero');
 await page.getByRole('button',{name:'Crear aviso de granja'}).click();
 await expect(page.getByRole('status')).toContainText('Aviso operativo guardado');

 expect(bodies).toHaveLength(2);
 expect(bodies[0]?.operationKey).toBeTruthy();
 expect(bodies[1]?.operationKey).toBe(bodies[0]?.operationKey);
 expect(committed.size).toBe(1);
});

test('atender aviso separa claves por motivo y conserva la clave del motivo incierto',async({page})=>{
 const requests:Record<string,unknown>[]=[];
 let originalKey='';
 let originalReason='';
 let committed=false;
 const alert={id:88,key:'manual:88',type:'manual',sourceType:'manual',sourceId:'88',dueDate:'2026-11-08',bucket:'today',title:'Revisar bebedero',details:{},eventLink:'/alertas?alertId=88',animalCode:null,barnName:'Galpón A',status:'pending',priority:'normal',resolutionReason:null};
 await page.route('**/api/**',route=>route.fulfill({status:200,json:{ok:true,alerts:[],counts:{},barns:[{id:1,name:'Galpón A'}],notifications:[],unreadCount:0,rules:[]}}));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'administrador',username:'admin@prueba.pe'}}}));
 await page.route(/\/api\/alerts(?:\?.*)?$/,route=>route.fulfill({status:200,json:{ok:true,alerts:[alert],counts:{}}}));
 await page.route('**/api/alerts/88/attend',async route=>{
  const body=route.request().postDataJSON() as {operationKey:string;reason:string};
  requests.push(body);
  if(!committed){committed=true;originalKey=body.operationKey;originalReason=body.reason;await route.abort('failed');return;}
  if(body.operationKey===originalKey&&body.reason===originalReason){await route.fulfill({status:200,json:{ok:true,replayed:true,id:88,status:'attended'}});return;}
  if(body.operationKey===originalKey){await route.fulfill({status:409,json:{error:'Conflicto de reintento: clave reutilizada con otro motivo'}});return;}
  await route.fulfill({status:409,json:{error:'La alerta ya fue atendida'}});
 });

 await page.goto('/alertas');
 await page.getByRole('button',{name:'Atender'}).click();
 await page.getByLabel('Motivo o detalle de atención en galpón:').fill('Tarea verificada');
 await page.getByRole('button',{name:'Marcar como atendido'}).click();
 await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
 await page.getByLabel('Motivo o detalle de atención en galpón:').fill('Revisión adicional');
 await page.getByRole('button',{name:'Marcar como atendido'}).click();
 await expect(page.getByRole('alert')).toContainText('La alerta ya fue atendida');
 await page.getByLabel('Motivo o detalle de atención en galpón:').fill('Tarea verificada');
 await page.getByRole('button',{name:'Marcar como atendido'}).click();
 await expect(page.getByRole('status')).toContainText('Aviso marcado como atendido');

 expect(requests).toHaveLength(3);
 expect(requests[0]?.operationKey).toBeTruthy();
 expect(requests[1]?.operationKey).not.toBe(requests[0]?.operationKey);
 expect(requests[2]?.operationKey).toBe(requests[0]?.operationKey);
 expect(committed).toBe(true);
});
