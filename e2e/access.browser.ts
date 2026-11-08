import {test,expect} from '@playwright/test';

test('credenciales rechazadas o red caída nunca abren sesión',async({page})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.route('**/api/auth/login',route=>route.fulfill({status:401,json:{error:'Credenciales incorrectas'}}));
 await page.goto('/login');await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('');await expect(page.getByLabel('Contraseña',{exact:true})).toHaveValue('');
 await page.getByLabel('Usuario',{exact:true}).fill('operario@prueba.pe');await page.getByLabel('Contraseña',{exact:true}).fill('incorrecta');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Credenciales incorrectas');await expect(page.getByRole('navigation')).toHaveCount(0);
 await page.route('**/api/auth/login',route=>route.abort('failed'));await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('navigation')).toHaveCount(0);await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeEnabled();
});
test('el rol del servidor limita menú y acceso directo',async({page})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));
 await page.route('**/api/auth/login',route=>route.fulfill({status:200,json:{ok:true,user:{role:'operario',username:'operario@prueba.pe'}}}));
 await page.goto('/administracion');await page.getByLabel('Usuario',{exact:true}).fill('operario@prueba.pe');await page.getByLabel('Contraseña',{exact:true}).fill('PasswordSoloPrueba');await page.getByRole('button',{name:'Entrar',exact:true}).click();
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
 await page.goto('/inicio');await expect(page.getByRole('navigation')).toBeVisible();await expect(page.getByRole('button',{name:'Administración',exact:true})).toHaveCount(role==='administrador'?1:0);await expect(page.getByRole('button',{name:'Configuración',exact:true})).toHaveCount(role==='administrador'?1:0);await expect(page.locator('#select-perfil')).toHaveCount(0);
});
test('una versión nueva espera y cancelar actualización conserva el formulario',async({page})=>{
 await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Sin sesión'}}));await page.goto('/login');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.getByLabel('Usuario',{exact:true}).fill('borrador@prueba.pe');
 await page.evaluate(()=>navigator.serviceWorker.register('/sw.js?test-next=1',{updateViaCache:'none'}));await expect(page.getByRole('button',{name:'Actualizar aplicación',exact:true})).toBeVisible();
 await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('borrador@prueba.pe');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Actualizar aplicación',exact:true}).click();await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('borrador@prueba.pe');
 const lazy=await page.evaluate(async()=>{for(const name of await caches.keys()){for(const request of await (await caches.open(name)).keys()){if(request.url.includes('/assets/ModuloAnimales'))return new URL(request.url).pathname;}}return '';});expect(lazy).not.toBe('');await page.request.post('/__test/block-old-lazy');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Actualizar aplicación',exact:true}).click();await expect(page.getByLabel('Usuario',{exact:true})).toHaveValue('');const imported=await page.evaluate(async(path)=>typeof (await import(path)).ModuloAnimales,lazy);expect(imported).toBe('function');
});
