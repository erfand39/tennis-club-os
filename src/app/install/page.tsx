import Link from 'next/link';

export default function InstallPage() {
  return <main className="pwa-install">
    <header className="pwa-hero">
      <img src="/pwa/icon-192.png" width="64" height="64" alt="" />
      <div><h1>نصب باشگاه تنیس سام</h1><p>پنل باشگاه را از صفحهٔ اصلی دستگاه باز کنید.</p></div>
    </header>
    <div className="pwa-platforms">
      <section className="panel local-panel"><h2>iPhone و iPad</h2><p>آدرس HTTPS سامانه را در Safari باز کنید. از منوی اشتراک‌گذاری گزینهٔ «افزودن به صفحهٔ اصلی» را انتخاب کنید.</p></section>
      <section className="panel local-panel"><h2>Android</h2><p>در Chrome از منوی مرورگر «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید.</p></section>
      <section className="panel local-panel"><h2>Mac و رایانه</h2><p>در Safari مک از منوی File گزینهٔ Add to Dock را انتخاب کنید. در Chrome و Edge از گزینهٔ نصب کنار نوار آدرس استفاده کنید.</p></section>
    </div>
    <section className="panel local-panel"><h2>اتصال از گوشی</h2><p>گوشی و رایانهٔ میزبان باید به شبکهٔ باشگاه دسترسی داشته باشند. برای استفادهٔ محلی روی گوشی، نشانی HTTPS تنظیم‌شده روی رایانه را باز کنید.</p></section>
    <Link className="button primary" href="/">بازگشت به پنل</Link>
  </main>;
}
