import {test,expect} from '@playwright/test';

test('credenciales rechazadas o red caída nunca abren sesión',async({page})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.route('**/api/auth/login',route=>route.fulfill({status:401,json:{error:'Credenciales incorrectas'}}));
 await page.goto('/login');await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('');await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await page.getByLabel('Usuario',{exact:true}).fill('operario@prueba.pe');await page.getByLabel('Contraseña',{exact:true}).fill('incorrecta');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Credenciales incorrectas');await expect(page.getByRole('navigation')).toHaveCount(0);
 await page.route('**/api/auth/login',route=>route.abort('failed'));await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('navigation')).toHaveCount(0);await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeEnabled();
});
test('recordar credenciales las guarda en el administrador del navegador y solo conserva el usuario en la app',async({page})=>{
 await page.addInitScript(()=>{
  const target=window as typeof window & {PasswordCredential?:new (data:{id:string;password:string})=>Credential;__savedCredential?:{id:string;password:string}};
  target.PasswordCredential=class {id:string;password:string;type='password';constructor(form:HTMLFormElement){this.id=(form.elements.namedItem('username') as HTMLInputElement).value;this.password=(form.elements.namedItem('password') as HTMLInputElement).value;}} as unknown as typeof target.PasswordCredential;
  Object.defineProperty(navigator.credentials,'get',{configurable:true,value:async()=>null});
  Object.defineProperty(navigator.credentials,'store',{configurable:true,value:async(credential:Credential)=>{const saved=credential as Credential & {id:string;password:string};target.__savedCredential={id:saved.id,password:saved.password};return credential;}});
 });
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.route('**/api/auth/login',route=>route.fulfill({status:200,json:{ok:true,user:{role:'administrador',username:'admin@prueba.pe'}}}));
 await page.goto('/login');
 await page.getByLabel('Usuario',{exact:true}).fill('admin@prueba.pe');
 await page.getByLabel('Contraseña',{exact:true}).fill('ClaveSoloPrueba2026!');
 await page.getByLabel('Recordar usuario y contraseña').check();
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cerrar sesión'})).toBeVisible();
 const key='porcicola_remembered_username';
 await expect.poll(()=>page.evaluate((storageKey)=>JSON.parse(localStorage.getItem(storageKey)??'null'),key)).toEqual({username:'admin@prueba.pe'});
 await expect(page.evaluate(()=>JSON.stringify(localStorage))).resolves.not.toContain('ClaveSoloPrueba2026!');
 await expect.poll(()=>page.evaluate(()=>((window as typeof window & {__savedCredential?:{id:string;password:string}}).__savedCredential))).toEqual({id:'admin@prueba.pe',password:'ClaveSoloPrueba2026!'});
});
test('limpia la contraseña antigua en texto legible y permite borrar el usuario recordado',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('porcicola_saved_credentials',JSON.stringify({username:'admin@prueba.pe',password:'ClaveAntiguaSoloPrueba2026!'})));
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.goto('/login');
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('admin@prueba.pe');
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Recordar usuario y contraseña')).toBeChecked();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('porcicola_saved_credentials'))).toBeNull();
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('ClaveAntiguaSoloPrueba2026!');
 await page.getByRole('button',{name:'Borrar usuario recordado'}).click();
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('porcicola_remembered_username'))).toBeNull();
});
test('migra la contraseña antigua al abrir una sesión ya activa',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('porcicola_saved_credentials',JSON.stringify({username:'sesion@prueba.pe',password:'ClaveActivaSoloPrueba2026!'})));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role:'administrador',username:'sesion@prueba.pe'}}}));
 await page.goto('/inicio');
 await expect(page.getByRole('navigation')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('porcicola_saved_credentials'))).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('porcicola_remembered_username')??'null'))).toEqual({username:'sesion@prueba.pe'});
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('ClaveActivaSoloPrueba2026!');
});
test('precarga la contraseña del gestor del navegador sin persistirla en la app',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('porcicola_remembered_username',JSON.stringify({username:'gestor@prueba.pe'}));Object.defineProperty(navigator.credentials,'get',{configurable:true,value:async()=>({id:'gestor@prueba.pe',password:'ClaveDelGestorSoloPrueba2026!',type:'password'})});});
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.goto('/login');
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('gestor@prueba.pe');
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('ClaveDelGestorSoloPrueba2026!');
 await expect(page.getByLabel('Recordar usuario y contraseña')).toBeChecked();
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('ClaveDelGestorSoloPrueba2026!');
});
test('desmarcar recordar usuario conserva el borrador del formulario',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('porcicola_remembered_username',JSON.stringify({username:'guardado@prueba.pe'})));
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.goto('/login');
 await page.getByLabel('Usuario',{exact:true}).fill('nuevo@prueba.pe');
 await page.getByLabel('Contraseña',{exact:true}).fill('ClaveTemporalSoloPrueba');
 await page.getByLabel('Recordar usuario y contraseña').uncheck();
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('nuevo@prueba.pe');
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('ClaveTemporalSoloPrueba');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('porcicola_remembered_username'))).toBeNull();
});
test('una respuesta tardía del gestor no revierte la decisión de olvidar',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('porcicola_remembered_username',JSON.stringify({username:'guardado@prueba.pe'}));
  let resolveCredential:((credential:Credential|null)=>void)|undefined;
  Object.defineProperty(window,'__releaseCredential',{value:()=>resolveCredential?.({id:'guardado@prueba.pe',password:'ClaveTardiaSoloPrueba',type:'password'} as Credential)});
  Object.defineProperty(window,'__credentialRequestStarted',{value:false,writable:true});
  Object.defineProperty(navigator.credentials,'get',{configurable:true,value:()=>{(window as typeof window & {__credentialRequestStarted:boolean}).__credentialRequestStarted=true;return new Promise<Credential|null>(resolve=>{resolveCredential=resolve;});}});
  Object.defineProperty(navigator.credentials,'preventSilentAccess',{configurable:true,value:async()=>undefined});
 });
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.goto('/login');
 await expect.poll(()=>page.evaluate(()=>((window as typeof window & {__credentialRequestStarted:boolean}).__credentialRequestStarted))).toBe(true);
 await page.getByLabel('Recordar usuario y contraseña').uncheck();
 await page.evaluate(()=>((window as typeof window & {__releaseCredential:()=>void}).__releaseCredential()));
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('guardado@prueba.pe');
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Recordar usuario y contraseña')).not.toBeChecked();
});
test('el rol del servidor limita menú y acceso directo',async({page})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.route('**/api/auth/login',route=>route.fulfill({status:200,json:{ok:true,user:{role:'operario',username:'operario@prueba.pe'}}}));
 await page.goto('/administracion');await page.getByLabel('Usuario',{exact:true}).fill('operario@prueba.pe');await page.getByLabel('Contraseña',{exact:true}).fill('PasswordSoloPrueba');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page).toHaveURL(/\/galpones$/);
  await page.route('**/api/auth/me',route=>route.fulfill({json:{user:{role:'operario',username:'operario@prueba.pe'}}}));
  await page.goto('/administracion');
  await expect(page.getByRole('heading',{name:'Acceso restringido'})).toBeVisible();await expect(page.getByRole('navigation')).toBeVisible();await expect(page.getByRole('button',{name:'Administración',exact:true})).toHaveCount(0);await expect(page.locator('#select-perfil')).toHaveCount(0);await expect(page).toHaveURL(/\/administracion$/);
});
test('fallo al verificar sesión oculta módulos y permite reintentar',async({page})=>{
 await page.route('**/api/auth/me',route=>route.abort('failed'));await page.goto('/animales');await expect(page.getByRole('heading',{name:'No se pudo comprobar la sesión'})).toBeVisible();await expect(page.getByRole('navigation')).toHaveCount(0);
});
test('manifest instalable y service worker solo conservan estáticos',async({page,context})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));await page.goto('/login');
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');expect(manifest.icons).toHaveLength(3);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.evaluate(()=>fetch('/api/auth/me'));
 const paths=await page.evaluate(async()=>{const names=await caches.keys();const paths:string[]=[];for(const name of names){for(const request of await (await caches.open(name)).keys())paths.push(new URL(request.url).pathname);}return paths;});
 expect(paths).toContain('/offline.html');expect(paths.some(path=>path.startsWith('/api/')||path==='/login'||path==='/')).toBe(false);
 await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Sin conexión'})).toBeVisible();await expect(page.getByText('Esta pantalla no confirma ninguna operación.',{exact:false})).toBeVisible();
});
for(const role of ['administrador','responsable','operario','veterinario'])test(`menú usa permisos del servidor para ${role}`,async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:403,json:{error:'Consulta no disponible en esta prueba'}}));
 await page.route('**/api/auth/me',route=>route.fulfill({status:200,json:{ok:true,user:{role,username:`${role}@prueba.pe`}}}));
  await page.route('**/api/barns',route=>route.fulfill({json:{barns:[{id:1,name:'Galpón A'}]}}));
  await page.goto('/inicio');await page.getByRole('checkbox',{name:'Galpón A'}).check();await page.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(page.getByRole('navigation')).toBeVisible();await expect(page.getByRole('button',{name:'Administración',exact:true})).toHaveCount(role==='administrador'?1:0);await expect(page.getByRole('button',{name:'Configuración',exact:true})).toHaveCount(role==='administrador'?1:0);await expect(page.locator('#select-perfil')).toHaveCount(0);
});
test('una versión nueva espera y cancelar actualización conserva el formulario',async({page})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));await page.goto('/login');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.getByLabel('Usuario',{exact:true}).fill('borrador@prueba.pe');
 await page.evaluate(()=>navigator.serviceWorker.register('/sw.js?test-next=1',{updateViaCache:'none'}));await expect(page.getByRole('button',{name:'Actualizar',exact:true})).toBeVisible();
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('borrador@prueba.pe');const updateButton=page.getByRole('button',{name:'Actualizar',exact:true});await updateButton.click();const updateDialog=page.getByRole('dialog',{name:'Actualizar Aplicación'});await expect(updateDialog).toBeVisible();const laterButton=updateDialog.getByRole('button',{name:'Más tarde'});const confirmButton=updateDialog.getByRole('button',{name:'Actualizar ahora'});await expect(laterButton).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(confirmButton).toBeFocused();await page.keyboard.press('Tab');await expect(laterButton).toBeFocused();await laterButton.click();await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('borrador@prueba.pe');await expect(updateButton).toBeFocused();
 const lazy=await page.evaluate(async()=>{for(const name of await caches.keys()){for(const request of await (await caches.open(name)).keys()){if(request.url.includes('/assets/ModuloAnimales'))return new URL(request.url).pathname;}}return '';});expect(lazy).not.toBe('');
 try {
  await page.request.post('/__test/block-old-lazy');
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(updateDialog).toBeVisible();await updateDialog.getByRole('button',{name:'Actualizar ahora'}).click();await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('');const imported=await page.evaluate(async(path)=>typeof (await import(path)).ModuloAnimales,lazy);expect(imported).toBe('function');
 } finally {
  await page.request.post('/__test/unblock-old-lazy').catch(()=>undefined);
 }
});
