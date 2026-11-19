import { AccessShell } from '../ui';
import { RedeemForm } from './redeem-form';

export default async function Redeem({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === 'invite' ? 'invite' : 'recovery';
  return <AccessShell><div className="access-heading">
    <h1>{mode === 'invite' ? 'پذیرش دعوت باشگاه' : 'بازیابی گذرواژه'}</h1>
    <p>برای حساب محلی خود گذرواژه‌ای جدید انتخاب کنید.</p>
  </div><RedeemForm mode={mode} /></AccessShell>;
}
