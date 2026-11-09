import {useEffect,useState} from 'react';
import {ModalDialog} from './ModalDialog';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome:'accepted'|'dismissed'}> }

export function PwaControls(){
  const [install,setInstall]=useState<InstallPrompt|null>(null);
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  const [message,setMessage]=useState('');
  const [confirmUpdate,setConfirmUpdate]=useState(false);
  useEffect(()=>{
    const prompt=(event:Event)=>{event.preventDefault();setInstall(event as InstallPrompt);};
    const installed=()=>setInstall(null);
    window.addEventListener('beforeinstallprompt',prompt);window.addEventListener('appinstalled',installed);
    let registration:ServiceWorkerRegistration|undefined;let cancelled=false;
    const check=()=>{if(registration?.waiting)setWaiting(registration.waiting);};
    if(import.meta.env.PROD&&'serviceWorker' in navigator&&window.isSecureContext){
      void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(result=>{
        if(cancelled)return;registration=result;check();
        result.addEventListener('updatefound',()=>{result.installing?.addEventListener('statechange',check);});
      }).catch(()=>{if(!cancelled)setMessage('No se pudo preparar la instalación. Puedes seguir usando la web con conexión.');});
    }
    const refresh=()=>{if(document.visibilityState==='visible')void registration?.update().catch(()=>undefined);};
    document.addEventListener('visibilitychange',refresh);
    return()=>{cancelled=true;window.removeEventListener('beforeinstallprompt',prompt);window.removeEventListener('appinstalled',installed);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const installApp=async()=>{if(!install)return;await install.prompt();await install.userChoice;setInstall(null);};
  const performUpdate=()=>{
    if(!waiting)return;
    setConfirmUpdate(false);
    let refreshed=false;const reload=()=>{if(!refreshed){refreshed=true;window.location.reload();}};
    navigator.serviceWorker.addEventListener('controllerchange',reload,{once:true});
    waiting.addEventListener('statechange',()=>{if(waiting.state==='activated')reload();});
    waiting.postMessage({type:'ACTIVATE_UPDATE'});
  };
  if(!install&&!waiting&&!message)return null;
  return <>
    <aside aria-label="Instalación y actualizaciones" className="pwa-controls">
      {message&&<p role="status">{message}</p>}
      {install&&<button type="button" className="btn btn-secondary" onClick={()=>void installApp()}>Instalar aplicación</button>}
      {waiting&&<><span>Hay una versión nueva. Puedes actualizar al terminar tu trabajo.</span><button type="button" className="btn btn-primary" onClick={()=>setConfirmUpdate(true)}>Actualizar aplicación</button></>}
    </aside>
    {confirmUpdate&&(
      <ModalDialog labelledBy="pwa-update-dialog-title" onDismiss={() => setConfirmUpdate(false)}>
          <h4 id="pwa-update-dialog-title" className="text-lg font-bold mb-2">Actualizar Aplicación</h4>
          <p className="text-sm text-muted mb-4">
            La actualización recargará la página para cargar la versión más reciente. Guarda tus formularios pendientes antes de continuar. ¿Deseas recargar ahora?
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={()=>setConfirmUpdate(false)}>Más tarde</button>
            <button type="button" className="btn btn-primary" onClick={performUpdate}>Actualizar ahora</button>
          </div>
      </ModalDialog>
    )}
  </>;
}
