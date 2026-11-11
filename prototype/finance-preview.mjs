import { number } from './model.mjs';

const root=document.querySelector('#finance');
const editor=document.querySelector('#finance-editor');
const feedback=document.querySelector('#finance-feedback');
const methods={cash:'نقدی',card:'کارت‌خوان',transfer:'واریز بانکی'};
const offerings=[
  { id:'one',title:'اجارهٔ زمین ۱',price:1800000 },
  { id:'two',title:'تمرین خصوصی · زمین ۲',price:2400000 },
  { id:'three',title:'کلاس گروهی · زمین ۳',price:1500000 },
];
let sequence=1043;
let selected=null;
const invoices=[
  { number:1041,offering:'one',discount:100000,discountReason:'تخفیف باشگاه',payments:[{id:1,amount:900000,method:'card',refunds:[]}] },
  { number:1042,offering:'two',discount:0,discountReason:'',payments:[] },
];
const money=amount=>`${number(amount)} ریال`;
const offering=item=>offerings.find(entry=>entry.id===item.offering);
const sum=values=>values.reduce((total,value)=>total+value,0);
const gross=item=>sum(item.payments.map(p=>p.amount));
const refunded=item=>sum(item.payments.flatMap(p=>p.refunds.map(r=>r.amount)));
const total=item=>offering(item).price-item.discount;
const net=item=>gross(item)-refunded(item);
const due=item=>item.voidReason?0:total(item)-net(item);
const state=item=>item.voidReason?'باطل‌شده':due(item)===0?'تسویه‌شده':net(item)>0?'پرداخت جزئی':'باز';

function escape(value) {
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}
function amountFrom(form,key) {
  const raw=String(form.get(key) ?? '').trim().replace(/[۰-۹٠-٩]/g,char=>String(char.charCodeAt(0)&15)).replaceAll('٬',',');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return NaN;
  const amount=Number(raw.replaceAll(',',''))*(form.get('unit')==='toman'?10:1);
  return Number.isSafeInteger(amount) && amount<=9999999999999 ? amount : NaN;
}
function amountField(label,key='amount',optional=false) {
  return `<div class="form-grid">
    <label class="field"><span>${label}</span><input name="${key}" inputmode="numeric" dir="ltr" maxlength="20" ${optional?'':'required'}></label>
    <label class="field"><span>واحد مبلغ</span><select name="unit"><option value="minor">ریال</option><option value="toman">تومان</option></select></label>
  </div>`;
}
function reasonField(label,optional=false) {
  return `<label class="field"><span>${label}</span><input name="reason" maxlength="250" ${optional?'':'required'}></label>`;
}
function badge(item) {
  return `<span class="resource-status ${item.voidReason?'is-inactive':due(item)===0?'is-active':'is-archived'}"><i></i>${state(item)}</span>`;
}

function render() {
  const cards=[
    ['فاکتورهای معتبر',sum(invoices.filter(item=>!item.voidReason).map(total))],
    ['دریافت ثبت‌شده',sum(invoices.map(gross))],['بازپرداخت',sum(invoices.map(refunded))],
    ['دریافتی خالص',sum(invoices.map(net))],['ماندهٔ فاکتورها',sum(invoices.map(due))],
  ];
  const current=invoices.find(item=>item.number===selected);
  root.innerHTML=`
    <header class="local-heading directory-heading"><div><h1>امور مالی</h1><p>نمونهٔ تعاملی با دادهٔ ساختگی</p></div>
      <button class="button primary" data-action="issue">صدور فاکتور</button>
    </header>
    <section class="finance-totals" aria-label="خلاصهٔ امور مالی">${cards.map(([label,value])=>
      `<article class="stat-card"><span class="stat-top">${label}</span><strong class="stat-value">${money(value)}</strong></article>`).join('')}</section>
    <div class="calendar-detail">
      <section class="panel local-panel"><h2>فهرست فاکتورها</h2>
        <ul class="resource-list">${invoices.map(item=>`<li><button class="calendar-row preview-finance-row" data-action="select" data-invoice="${item.number}"
          aria-pressed="${item.number===selected}"><span><strong>فاکتور ${number(item.number)}</strong><small>${offering(item).title}</small></span>
          <span><small>مانده</small>${money(due(item))}</span>${badge(item)}</button></li>`).join('')}</ul>
      </section>
      <section class="panel local-panel" aria-label="جزئیات فاکتور">${current?detail(current):'<h2>ریز فاکتور</h2><p>برای دیدن دریافت‌ها و مانده، یک فاکتور را انتخاب کنید.</p>'}</section>
    </div>`;
}
function detail(item) {
  return `<div class="calendar-section-title"><h2>فاکتور ${number(item.number)}</h2>${badge(item)}</div>
    <dl class="detail-list">
      <div><dt>${offering(item).title}</dt><dd>${money(offering(item).price)}</dd></div>
      <div><dt>تخفیف</dt><dd>${money(item.discount)}</dd></div>
      <div><dt>مانده</dt><dd>${money(due(item))}</dd></div>
    </dl>
    ${item.discountReason?`<p>علت تخفیف · ${escape(item.discountReason)}</p>`:''}
    ${item.voidReason?`<p>علت ابطال · ${escape(item.voidReason)}</p>`:''}
    <div class="calendar-section-title">
      ${due(item)>0?`<button class="button primary" data-action="payment" data-invoice="${item.number}">ثبت دریافت</button>`:''}
      ${!item.voidReason && net(item)===0?`<button class="button danger-quiet" data-action="void" data-invoice="${item.number}">ابطال فاکتور</button>`:''}
    </div>
    <h2>گردش دریافت و بازپرداخت</h2>
    ${item.payments.length?`<ul class="resource-list finance-ledger">${item.payments.map(payment=>`<li>
      <div class="finance-movement"><strong>دریافت ${methods[payment.method]}</strong><strong>${money(payment.amount)}</strong></div>
      ${payment.refunds.length?`<ul class="resource-timeline finance-refunds">${payment.refunds.map(refund=>
        `<li><span>بازپرداخت<small>${escape(refund.reason)}</small></span><strong>${money(refund.amount)}</strong></li>`).join('')}</ul>`:''}
      ${payment.amount>sum(payment.refunds.map(r=>r.amount))?`<button class="button subtle" data-action="refund" data-invoice="${item.number}" data-payment="${payment.id}">ثبت بازپرداخت</button>`:''}
    </li>`).join('')}</ul>`:'<p>دریافتی برای این فاکتور ثبت نشده است.</p>'}`;
}
function formFor(action,invoice,payment) {
  const choices=offerings.filter(entry=>!invoices.some(item=>item.offering===entry.id && !item.voidReason));
  const definitions={
    issue:['صدور فاکتور',choices.length?`<label class="field"><span>سانس آزمایشی</span><select name="offering">
      ${choices.map(entry=>`<option value="${entry.id}">${entry.title} · ${money(entry.price)}</option>`).join('')}</select></label>
      ${amountField('تخفیف (اختیاری)','discount',true)}${reasonField('علت تخفیف',true)}`:''],
    payment:['ثبت دریافت',amountField('مبلغ دریافتی')+`<label class="field"><span>روش دریافت</span><select name="method">
      ${Object.entries(methods).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>`],
    refund:['ثبت بازپرداخت',amountField('مبلغ بازپرداخت')+reasonField('علت بازپرداخت')],
    void:['ابطال فاکتور',reasonField('علت ابطال')],
  };
  const [title,fields]=definitions[action];
  editor.innerHTML=`<div class="dialog-inner"><header class="dialog-header"><h2 id="finance-title">${title}</h2></header>
    ${fields?`<form class="local-form" data-action="${action}" data-invoice="${invoice?.number ?? ''}" data-payment="${payment ?? ''}">
      ${fields}<p class="form-error" role="alert" hidden></p><button class="button primary">تأیید و ثبت در نمونه</button></form>`
      :'<p>همهٔ سانس‌های آزمایشی فاکتور فعال دارند.</p>'}
    <footer class="dialog-actions"><button class="button subtle" data-action="close">بستن</button></footer></div>`;
  editor.showModal();
}

root.addEventListener('click',event=>{
  const control=event.target.closest('button[data-action]');
  if (!control) return;
  const item=invoices.find(invoice=>invoice.number===Number(control.dataset.invoice));
  if (control.dataset.action==='select') {
    selected=item.number;
    render();
    root.querySelector(`[data-invoice="${item.number}"]`)?.focus();
  } else formFor(control.dataset.action,item,control.dataset.payment);
});
editor.addEventListener('click',event=>{
  if (event.target.closest('[data-action="close"]')) editor.close();
});
editor.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target;
  const values=new FormData(form);
  const action=form.dataset.action;
  let item=invoices.find(invoice=>invoice.number===Number(form.dataset.invoice));
  const reason=String(values.get('reason') ?? '').trim();
  const fail=message=>{
    const alert=form.querySelector('[role="alert"]');
    alert.textContent=message;
    alert.hidden=false;
  };
  if (action==='issue') {
    const entry=offerings.find(row=>row.id===values.get('offering'));
    if (!entry || invoices.some(row=>row.offering===entry.id && !row.voidReason)) return fail('سانس را دوباره انتخاب کنید.');
    const discount=String(values.get('discount')).trim()?amountFrom(values,'discount'):0;
    if (!Number.isFinite(discount) || discount>entry.price || Boolean(discount)!==Boolean(reason)) return fail('مبلغ و علت تخفیف را بررسی کنید.');
    item={number:sequence++,offering:entry.id,discount,discountReason:reason,payments:[]};
    invoices.unshift(item);
  } else if (action==='void') {
    if (net(item)!==0 || !reason) return fail('ابطال به ماندهٔ دریافتی صفر و ثبت علت نیاز دارد.');
    item.voidReason=reason;
  } else {
    const amount=amountFrom(values,'amount');
    if (!Number.isFinite(amount) || amount<=0) return fail('مبلغ صحیح و بزرگ‌تر از صفر وارد کنید.');
    if (action==='payment') {
      if (amount>due(item)) return fail('مبلغ از ماندهٔ فاکتور بیشتر است.');
      item.payments.push({id:item.payments.length+1,amount,method:values.get('method'),refunds:[]});
    } else {
      const payment=item.payments.find(entry=>entry.id===Number(form.dataset.payment));
      if (!payment || amount>payment.amount-sum(payment.refunds.map(row=>row.amount))) return fail('مبلغ از دریافت قابل برگشت بیشتر است.');
      if (!reason) return fail('علت بازپرداخت را وارد کنید.');
      payment.refunds.push({amount,reason});
    }
  }
  selected=item.number;
  editor.close();
  render();
  root.querySelector(`[data-invoice="${item.number}"]`)?.focus();
  feedback.textContent='عملیات در نمونه ثبت شد.';
});
render();
