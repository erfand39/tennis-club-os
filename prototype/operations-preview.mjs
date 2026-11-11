import { number } from './model.mjs';

const sections=document.querySelector('#sections');
const root=document.querySelector('#operations');
const feedback=document.querySelector('#operations-feedback');
const tabs={packages:'بسته و عضویت',expenses:'هزینه‌ها',coaches:'تسویهٔ مربیان',rates:'تعرفهٔ ویژه'};
const money=value=>number(value)+' ریال';
const expenses=[{title:'توپ تمرین',amount:850000,voided:false}];
let creditUsed=false;
let coachStatus='ready';
let rateEnabled=true;
let tab=Object.hasOwn(tabs,location.hash.slice(1))?location.hash.slice(1):'packages';

function escape(value) {
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}
function amount(value) {
  const raw=String(value ?? '').trim().replace(/[۰-۹٠-٩]/g,char=>String(char.charCodeAt(0)&15)).replaceAll('٬',',');
  if (!/^(?:\d{1,13}|\d{1,3}(?:,\d{3}){1,4})$/.test(raw)) return NaN;
  const result=Number(raw.replaceAll(',',''));
  return result>0 && result<=9999999999999 ? result : NaN;
}
const panels={
  packages:()=>`<section class="panel local-panel"><h2>بستهٔ ۸ جلسه تمرین</h2>
    <p>مهسا رحیمی · معتبر تا ۲۹ آذر ۱۴۰۵</p>
    <div class="finance-totals">
      <article class="stat-card"><span class="stat-top">ماندهٔ اعتبار</span><strong class="stat-value">${creditUsed?'۶':'۷'} جلسه</strong></article>
      <article class="stat-card"><span class="stat-top">جلسهٔ ۲۰ آبان</span><strong class="stat-value">${creditUsed?'اعتبار مصرف شد':'حاضر'}</strong></article>
    </div>
    <div class="finance-shortcuts">
      <button class="button primary" data-action="${creditUsed?'return':'redeem'}">${creditUsed?'بازگشت اعتبار آزمایشی':'مصرف اعتبار جلسهٔ آزمایشی'}</button>
    </div></section>`,
  expenses:()=>`<section class="panel local-panel"><h2>هزینه‌های ثبت‌شده</h2>
    <p>جمع هزینه‌های معتبر ${money(expenses.reduce((sum,row)=>sum+(row.voided?0:row.amount),0))}</p>
    <ul class="resource-timeline">${expenses.map((row,index)=>`<li><span>${escape(row.title)} <small>${row.voided?'باطل‌شده':'ثبت‌شده'}</small></span>
      <strong>${money(row.amount)}</strong>${row.voided?'':`<button class="button danger-quiet" data-action="void" data-index="${index}">ابطال آزمایشی</button>`}</li>`).join('')}</ul>
    <form class="local-form operations-row" id="preview-expense">
      <div class="resource-form-grid"><label class="field"><span>عنوان هزینه</span><input name="title" maxlength="100" required></label>
      <label class="field"><span>مبلغ به ریال</span><input name="amount" dir="ltr" inputmode="numeric" required maxlength="20"></label></div>
      <p class="local-notice error" role="alert" hidden></p><button class="button primary">ثبت هزینهٔ آزمایشی</button>
    </form></section>`,
  coaches:()=>`<section class="panel local-panel"><h2>تسویهٔ یک جلسهٔ برگزارشده</h2>
    <div class="finance-totals">
      <article class="stat-card"><span class="stat-top">آرمان کیانی · ۹۰ دقیقه</span><strong class="stat-value">${money(900000)}</strong></article>
      <article class="stat-card"><span class="stat-top">وضعیت</span><strong class="stat-value">${{ready:'آمادهٔ بررسی',approved:'تأییدشده',paid:'پرداخت‌شده'}[coachStatus]}</strong></article>
    </div>
    <p>مبنای نمونهٔ جلسه ${money(600000)} در ساعت است.</p>
    ${coachStatus==='paid'?'':`<button class="button primary" data-action="coach">${coachStatus==='ready'?'تأیید مبلغ نمونه':'ثبت پرداخت آزمایشی'}</button>`}
    </section>`,
  rates:()=>`<section class="panel local-panel"><h2>تعرفهٔ ویژهٔ زمین ۲</h2>
    <dl class="detail-list">
      <div><dt>تعرفهٔ پایه در هر ۶۰ دقیقه</dt><dd>${money(1500000)}</dd></div>
      <div><dt>چهارشنبه · ۱۸ تا ۲۲ · سانس ۶۰ دقیقه</dt><dd>${money(1800000)}</dd></div>
      <div><dt>مبلغ سانس نمونهٔ چهارشنبه ساعت ۱۹</dt><dd>${money(rateEnabled?1800000:1500000)}</dd></div>
    </dl>
    <button class="button subtle" data-action="rate">${rateEnabled?'نمایش مبلغ بدون نرخ ویژه':'اعمال نرخ ویژهٔ نمونه'}</button></section>`,
};

function render() {
  sections.innerHTML=Object.entries(tabs).map(([id,title])=>`<a href="#${id}" class="button ${id===tab?'primary':'subtle'}"
    ${id===tab?'aria-current="page"':''}>${title}</a>`).join('');
  root.innerHTML=panels[tab]();
}
function update(message,focus) {
  render();
  feedback.textContent=message;
  root.querySelector(focus)?.focus();
}
window.addEventListener('hashchange',()=>{
  const current=location.hash.slice(1);
  if (!Object.hasOwn(tabs,current)) return;
  tab=current;
  render();
  sections.querySelector('[aria-current]')?.focus();
});
root.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if (!button) return;
  switch(button.dataset.action) {
    case 'redeem':
    case 'return':
      creditUsed=!creditUsed;
      update(creditUsed?'اعتبار مصرف شد.':'اعتبار برگشت.','button[data-action]');
      break;
    case 'void':
      expenses[Number(button.dataset.index)].voided=true;
      update('هزینهٔ آزمایشی باطل شد.','#preview-expense input');
      break;
    case 'coach':
      coachStatus=coachStatus==='ready'?'approved':'paid';
      update('وضعیت تسویهٔ آزمایشی تغییر کرد.','button[data-action]');
      break;
    case 'rate':
      rateEnabled=!rateEnabled;
      update('مبلغ سانس نمونه به‌روز شد.','button[data-action]');
  }
});
root.addEventListener('submit',event=>{
  if (event.target.id!=='preview-expense') return;
  event.preventDefault();
  const form=new FormData(event.target);
  const title=String(form.get('title') ?? '').trim();
  const value=amount(form.get('amount'));
  if (!title || !Number.isFinite(value)) {
    const alert=event.target.querySelector('[role=alert]');
    alert.textContent='عنوان و مبلغ صحیح را وارد کنید.';
    alert.hidden=false;
    return;
  }
  expenses.push({title,amount:value,voided:false});
  update('هزینهٔ آزمایشی ثبت شد.','#preview-expense input');
});
render();
