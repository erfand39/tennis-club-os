const root = document.querySelector('#access');
const initial = root.innerHTML;
const roles = {
  owner: { label: 'مالک', scope: 'همهٔ شعبه‌های مجموعه', details: 'عضویت، دعوت و تغییر سطح دسترسی کاربران' },
  admin: { label: 'مدیر', scope: 'شعبهٔ مرکزی', details: 'مدیریت عملیات و گزارش‌های شعبهٔ مجاز' },
  receptionist: { label: 'پذیرش', scope: 'شعبهٔ مرکزی', details: 'برنامه و رزروهای شعبهٔ مجاز' },
  coach: { label: 'مربی', scope: 'شعبهٔ مرکزی', details: 'جلسات و شاگردان مرتبط با همین حساب' },
  accountant: { label: 'حسابدار', scope: 'شعبهٔ مرکزی', details: 'فاکتورها و دریافت‌های شعبهٔ مجاز' },
  student: { label: 'شاگرد', scope: 'شعبهٔ مرکزی', details: 'پرونده و برنامهٔ آموزشی همین حساب' },
};
const members = [
  { name: 'مدیر باشگاه', role: 'owner', active: true },
  { name: 'رها نوری', role: 'admin', active: true },
  { name: 'بهنام زمانی', role: 'receptionist', active: true },
  { name: 'آرمان کیانی', role: 'coach', active: true },
  { name: 'ترانه فرهمند', role: 'accountant', active: false },
  { name: 'سارا راد', role: 'student', active: true },
];

function roster(filter = '') {
  return members.filter(person => !filter || person.role === filter).map(person =>
    `<li><strong>${person.name}</strong><span>${roles[person.role].label}</span><span class="local-label">${person.active ? 'فعال' : 'غیرفعال'}</span></li>`).join('');
}

root.addEventListener('submit', event => {
  if (event.target.id !== 'demo-login') return;
  event.preventDefault();
  const selected = String(new FormData(event.target).get('role'));
  if (!Object.hasOwn(roles, selected)) return;
  const role = roles[selected];
  root.className = 'local-content';
  root.innerHTML = `
    <header class="local-heading">
      <a class="local-brand" href="./"><span class="sam-mark" aria-hidden="true"></span><span><strong>باشگاه تنیس سام</strong><small dir="ltr">SAM TENNIS CLUB</small></span></a>
      <button class="button subtle" id="demo-logout">تغییر نقش نمونه</button>
    </header>
    <section class="local-hero"><div><h1 tabindex="-1" id="demo-title">دسترسی ${role.label}</h1><p>${role.scope}</p><p>${role.details}</p></div></section>
    <div class="local-grid" style="margin-top:14px">
      <section class="panel local-panel"><h2>حساب و حوزهٔ دسترسی</h2><p>${role.details}</p><p>${role.scope}</p>
        <a class="panel-link" href="./">داشبورد نمونه</a>
      </section>
      ${selected === 'owner' ? `<section class="panel local-panel">
        <h2>اعضای نمونه</h2>
        <label class="field"><span>فیلتر نقش</span><select id="demo-filter"><option value="">همهٔ نقش‌ها</option>
          ${Object.entries(roles).map(([id, item]) => `<option value="${id}">${item.label}</option>`).join('')}</select></label>
        <ul class="local-branches" id="demo-members">${roster()}</ul>
      </section>` : '<section class="panel local-panel"><h2>مدیریت کاربران</h2><p>مدیریت عضویت و نقش کاربران در دسترسی مالک مجموعه قرار دارد.</p></section>'}
    </div>`;
  root.querySelector('#demo-title').focus();
});

root.addEventListener('change', event => {
  if (event.target.id === 'demo-filter') root.querySelector('#demo-members').innerHTML = roster(event.target.value);
});
root.addEventListener('click', event => {
  if (event.target.id !== 'demo-logout') return;
  root.className = 'access-shell';
  root.innerHTML = initial;
  root.querySelector('select').focus();
});
