import registration from './register.mjs';

const items=[
  {id:'lesson',branch:'central',name:'یادآوری جلسه',detail:'کلاس گروهی زمین ۲ ساعت ۱۷:۳۰ شروع می‌شود.',time:'امروز، ۱۶:۳۰',href:'./#classes'},
  {id:'moved',branch:'central',name:'تغییر برنامهٔ سانس',detail:'سانس تمرین خصوصی به زمین ۱ منتقل شد.',time:'امروز، ۱۵:۱۰',href:'./#calendar'},
  {id:'payment',branch:'park',name:'پیگیری پرداخت',detail:'فاکتور نمونه برای بررسی مانده آماده است.',time:'دیروز، ۱۰:۰۰',href:'./finance.html'},
  {id:'group',branch:'park',name:'تغییر فهرست شاگردان کلاس',detail:'ثبت‌نام یک شاگرد به کلاس گروهی اضافه شد.',time:'دیروز، ۹:۲۵',href:'./#classes'},
];
const branchNames={central:'شعبهٔ مرکزی',park:'شعبهٔ پارک'};
const key='sam-demo-notice-read';
const branch=document.querySelector('#notice-branch');
const list=document.querySelector('#notice-list');
const all=document.querySelector('#mark-all');
const test=document.querySelector('#test-notice');
const feedback=document.querySelector('#device-feedback');
let read=new Set();
try {
  const saved=JSON.parse(localStorage.getItem(key));
  if (Array.isArray(saved)) read=new Set(saved.filter(id=>items.some(item=>item.id===id)));
} catch {}

function render() {
  const visible=items.filter(item=>!branch.value||item.branch===branch.value);
  all.disabled=visible.every(item=>read.has(item.id));
  list.innerHTML=visible.map(item=>`<li class="${read.has(item.id)?'':'notice-unread'}">
    <div class="notice-item"><span class="notice-meta">${branchNames[item.branch]} · ${item.time}</span>
    <h2>${item.name}</h2><p>${item.detail}</p>${read.has(item.id)?'':'<span class="notice-badge">خوانده‌نشده</span>'}</div>
    <div class="notice-actions"><a class="button subtle" href="${item.href}">مشاهدهٔ نمونه</a>
    ${read.has(item.id)?'':`<button class="button subtle" type="button" data-read="${item.id}">خوانده شد</button>`}</div>
    </li>`).join('');
}
function mark(ids) {
  for (const id of ids) read.add(id);
  try {localStorage.setItem(key,JSON.stringify([...read]));} catch {}
  render();
}
branch.addEventListener('change',render);
all.addEventListener('click',()=>mark(items.filter(item=>!branch.value||item.branch===branch.value).map(item=>item.id)));
list.addEventListener('click',event=>{
  const button=event.target.closest('[data-read]');
  if (!button) return;
  const index=Array.from(list.children).indexOf(button.closest('li'));
  mark([button.dataset.read]);
  list.children[index]?.querySelector('a')?.focus();
});
render();

registration.then(worker=>{
  if (!worker||!('Notification' in window)||!('showNotification' in worker)) {
    feedback.textContent='در مرورگرهای پشتیبانی‌شده می‌توانید پس از نصب، اعلان نمونه را امتحان کنید.';
    return;
  }
  test.hidden=false;
  test.addEventListener('click',async()=>{
    try {
      const permission=await Notification.requestPermission();
      if (permission!=='granted') {
        feedback.textContent='مجوز اعلان داده نشد. تنظیمات مرورگر را بررسی کنید.';
        return;
      }
      const active=await navigator.serviceWorker.ready;
      await active.showNotification('باشگاه تنیس سام',{body:'این یک اعلان نمونه است.',icon:'/pwa/icon-192.png',tag:'sam-demo-notice'});
      feedback.textContent='اعلان نمونه نمایش داده شد.';
    } catch {
      feedback.textContent='نمایش اعلان روی این دستگاه در دسترس نیست.';
    }
  });
});
