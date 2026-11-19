import Link from 'next/link';

export default function ClubNotFound() {
  return (
    <section className="panel local-panel">
      <header className="local-heading">
        <h1>پرونده یا بخش موردنظر پیدا نشد</h1>
        <p>این صفحه یا پرونده در دسترس نیست یا در محدودهٔ شعبه‌های شما قرار ندارد.</p>
      </header>
      <Link className="button primary" href="/club">بازگشت به میز کار</Link>
    </section>
  );
}
