'use client';

import { createContext,type FormEvent,type ReactNode,useContext,useEffect,useRef,useState } from 'react';
import { financePath,isFinanceCommand,type FinanceCommandName } from '@/lib/finance-fields';
import { errorMessage } from '@/lib/messages';
import { currencyLabel,formatMinor,parseMinor } from '@/lib/money';

type Pending={command:FinanceCommandName;request:string;fields:string};
type Context={blocked:boolean;send:(command:FinanceCommandName,form:HTMLFormElement)=>void};
const FinanceContext=createContext<Context|null>(null);
const rejectionCodes=new Set([
  'finance-invalid','finance-amount','finance-reason','finance-discount','finance-discount-cap','finance-not-invoiceable',
  'club-finance-invalid','club-finance-date','club-finance-transition','training-ineligible','training-duplicate',
  'training-empty','booking-student-unavailable','training-private-covered','training-private-invoiced','training-used','training-cancel-first','coach-estimate-changed','rate-special-conflict',
  'finance-already-invoiced','finance-closed','finance-due','finance-refund-cap','finance-has-receipts',
]);

function loadDraft(key:string):Pending|null {
  const raw=localStorage.getItem(key);
  if (!raw) return null;
  const draft=JSON.parse(raw) as Pending;
  if (!isFinanceCommand(draft.command) || !/^[a-f0-9-]{36}$/.test(draft.request) || typeof draft.fields!=='string' || draft.fields.length>8192) {
    throw new Error('Invalid pending finance command');
  }
  return draft;
}

export function FinanceActions({user,org,branch,subject,children}:{
  user:string;org:string;branch:string;subject:{booking:string}|{invoice:string}|{operation:string};children:ReactNode;
}) {
  const key=`sam-finance-v1:${user}:${org}:${'invoice' in subject ? 'invoice:'+subject.invoice : 'booking' in subject ? 'booking:'+subject.booking : 'operation:'+subject.operation}`;
  const [pending,setPending]=useState<Pending|null>(null);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [problem,setProblem]=useState<string>();
  const running=useRef(false);
  useEffect(()=>{
    function read() {
      try {
        setPending(loadDraft(key));
        setReady(true);
      } catch {
        setReady(false);
        setProblem(errorMessage('finance-local-storage'));
      }
    }
    function sync(event:StorageEvent) {
      if (event.key===key || event.key===null) read();
    }
    read();
    window.addEventListener('storage',sync);
    return ()=>window.removeEventListener('storage',sync);
  },[key]);

  async function dispatch(draft:Pending,checkOnly:boolean) {
    if (running.current) return;
    running.current=true;
    setBusy(true);
    setProblem(undefined);
    try {
      const body=new URLSearchParams(checkOnly ? undefined : draft.fields);
      body.set('org',org);
      body.set('branch',branch);
      body.set('request',draft.request);
      if ('invoice' in subject) body.set('invoice',subject.invoice);
      else if ('booking' in subject) body.set('booking',subject.booking);
      if (checkOnly) body.set('command',draft.command);
      const response=await fetch('/api/'+(checkOnly?'finance-operation':draft.command),{
        method:'POST',headers:{Accept:'application/json'},body,
      });
      const data=await response.json();
      if (response.ok && typeof data.next==='string' && data.next.startsWith(financePath(org)+'/')) {
        if (loadDraft(key)?.request===draft.request) localStorage.removeItem(key);
        location.assign(data.next);
        return;
      }
      if (!checkOnly && rejectionCodes.has(data.error)) {
        if (loadDraft(key)?.request===draft.request) localStorage.removeItem(key);
        setPending(loadDraft(key));
      }
      setProblem(errorMessage(data.error ?? (data.status==='unconfirmed'?'finance-unconfirmed':'unavailable')));
    } catch {
      setProblem(errorMessage('finance-unconfirmed'));
    } finally {
      running.current=false;
      setBusy(false);
    }
  }

  function send(command:FinanceCommandName,form:HTMLFormElement) {
    if (!ready || running.current) return;
    try {
      const previous=loadDraft(key);
      if (previous) {
        setPending(previous);
        return;
      }
      const fields=new URLSearchParams();
      new FormData(form).forEach((value,name)=>fields.append(name,String(value)));
      const draft={command,request:crypto.randomUUID(),fields:fields.toString()};
      localStorage.setItem(key,JSON.stringify(draft));
      setPending(draft);
      void dispatch(draft,false);
    } catch {
      setProblem(errorMessage('finance-local-storage'));
    }
  }

  return <FinanceContext.Provider value={{blocked:!ready || busy || pending!==null,send}}>
    {pending && <div className="panel local-panel finance-recovery" role="status">
      <strong>{busy?'در حال بررسی عملیات مالی…':'یک عملیات مالی در انتظار تأیید است'}</strong>
      {!busy && <div>
        <button type="button" className="button subtle" onClick={()=>void dispatch(pending,true)}>بررسی نتیجه</button>
        <button type="button" className="button subtle" onClick={()=>void dispatch(pending,false)}>ارسال دوبارهٔ همان عملیات</button>
      </div>}
    </div>}
    {problem && <p className="local-notice error" role="alert">{problem}</p>}
    {children}
  </FinanceContext.Provider>;
}

export function FinanceForm({command,label,children,danger=false}:{
  command:FinanceCommandName;label:string;children:ReactNode;danger?:boolean;
}) {
  const context=useContext(FinanceContext);
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (context && !context.blocked) context.send(command,event.currentTarget);
  }
  return <form className="local-form finance-form" onSubmit={submit}>
    <fieldset disabled={!context || context.blocked} className="local-form calendar-inputs">
      {children}
      <button className={`button ${danger?'danger-quiet':'primary'}`}>{label}</button>
    </fieldset>
  </form>;
}

export function AmountFields({currency,name='amount',label='مبلغ',required=true}:{
  currency:string;name?:string;label?:string;required?:boolean;
}) {
  const [input,setInput]=useState('');
  const [unit,setUnit]=useState('minor');
  const normalized=parseMinor(input,unit,currency);
  return <>
    <div className="resource-form-grid">
      <label className="field"><span>{label}</span><input name={name} dir="ltr" inputMode="numeric" maxLength={24}
        required={required} value={input} onChange={event=>setInput(event.currentTarget.value)} /></label>
      <label className="field"><span>واحد مبلغ</span><select name="unit" value={unit} onChange={event=>setUnit(event.currentTarget.value)}>
        <option value="minor">{currencyLabel(currency)}</option>{currency==='IRR' && <option value="toman">تومان</option>}
      </select></label>
    </div>
    {unit==='toman' && normalized!==null && <p className="finance-conversion">معادل {formatMinor(normalized,currency)}</p>}
  </>;
}
