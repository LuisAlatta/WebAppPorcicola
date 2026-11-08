import {useEffect,useState} from 'react';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome:'accepted'|'dismissed'}> }

export function PwaControls(){
  const [install,setInstall]=useState<InstallPrompt|null>(null);
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  const [message,setMessage]=useState('');
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
  const updateApp=()=>{
    if(!waiting)return;
    if(!window.confirm('La actualización recargará esta página. Guarda los formularios pendientes antes de continuar. ¿Actualizar ahora?'))return;
    let refreshed=false;const reload=()=>{if(!refreshed){refreshed=true;window.location.reload();}};
    navigator.serviceWorker.addEventListener('controllerchange',reload,{once:true});
    waiting.addEventListener('statechange',()=>{if(waiting.state==='activated')reload();});
    waiting.postMessage({type:'ACTIVATE_UPDATE'});
  };
  if(!install&&!waiting&&!message)return null;
  return <aside aria-label="Instalación y actualizaciones" className="pwa-controls">{message&&<p role="status">{message}</p>}{install&&<button type="button" className="btn btn-secondary" onClick={()=>void installApp()}>Instalar aplicación</button>}{waiting&&<><span>Hay una versión nueva. Puedes actualizar al terminar tu trabajo.</span><button type="button" className="btn btn-primary" onClick={updateApp}>Actualizar aplicación</button></>}</aside>;
}
