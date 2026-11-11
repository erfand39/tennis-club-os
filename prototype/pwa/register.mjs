export async function registerPreviewWorker() {
  if (!window.isSecureContext||!('serviceWorker' in navigator)) return null;
  try {
    const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
    let offered=false;
    const offerUpdate=()=>{
      if (!registration.waiting||!navigator.serviceWorker.controller||offered) return;
      offered=true;
      const status=document.createElement('aside');
      status.className='pwa-status pwa-update';
      status.setAttribute('role','status');
      const text=document.createElement('span');
      text.textContent='نسخهٔ جدید نمونه آماده است.';
      const button=document.createElement('button');
      button.type='button';
      button.textContent='به‌روزرسانی و بارگذاری';
      button.addEventListener('click',()=>{
        button.disabled=true;
        navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
        registration.waiting?.postMessage('activate-sam-update');
      });
      status.append(text,button);
      document.body.prepend(status);
    };
    offerUpdate();
    const watch=()=>registration.installing?.addEventListener('statechange',offerUpdate);
    watch();
    registration.addEventListener('updatefound',watch);
    return registration;
  } catch {
    return null;
  }
}
const registration=registerPreviewWorker();
export default registration;
