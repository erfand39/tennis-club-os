import Link from 'next/link';
import { AccessShell } from '@/app/ui';

export default function NotFound() {
  return (
    <AccessShell>
      <div className="access-heading">
        <h1>صفحهٔ موردنظر پیدا نشد</h1>
        <p>نشانی واردشده معتبر نیست یا این بخش جابه‌جا شده است.</p>
      </div>
      <div className="local-form">
        <Link className="button primary" href="/club">ورود به میز کار باشگاه</Link>
        <Link className="button subtle" href="/">بازگشت به صفحهٔ نخست</Link>
      </div>
    </AccessShell>
  );
}
