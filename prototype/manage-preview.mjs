import { coaches, courts, students, number } from './model.mjs';

const root = document.querySelector('#manage');
const dialog = document.querySelector('#editor');
const announcement = document.querySelector('#announcement');
const kinds = {
  courts: { title: 'زمین‌ها', item: 'زمین', field: 'نوع سطح' },
  coaches: { title: 'مربیان', item: 'مربی', field: 'تخصص' },
  students: { title: 'شاگردان', item: 'شاگرد', field: 'سطح مهارت' },
};
const states = { active: 'فعال', inactive: 'غیرفعال', archived: 'آرشیوشده' };
const fixtures = {
  courts: courts.map(row => ({ ...row, detail: row.surface })),
  coaches: coaches.map(row => ({ ...row, detail: row.note })),
  students: students.map(row => ({ ...row, detail: row.note })),
};
const records = Object.fromEntries(Object.entries(fixtures).map(([type, rows]) => [
  type, rows.map(row => ({ id: row.id, name: row.name, detail: row.detail, status: row.active ? 'active' : 'inactive' })),
]));
let kind = 'courts';
let query = '';
let status = '';
let origin;

function escape(value) {
  return String(value).replace(/[&<>"']/g, key => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[key]);
}
function options(items, selected) {
  return Object.entries(items).map(([key,label]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${label}</option>`).join('');
}
function openEditor(row) {
  origin = document.activeElement;
  dialog.innerHTML = `<div class="dialog-inner">
    <header class="dialog-header"><div><h2 id="editor-title">${row ? 'ویرایش' : 'ثبت'} ${kinds[kind].item}</h2><p>فرم آزمایشی پرونده</p></div>
      <button type="button" class="icon-button" data-action="close" aria-label="بستن">×</button></header>
    <form class="local-form" id="edit-form" data-id="${row?.id ?? ''}">
      <label class="field"><span>نام</span><input name="name" required maxlength="80" value="${escape(row?.name ?? '')}"></label>
      <label class="field"><span>${kinds[kind].field}</span><input name="detail" maxlength="80" value="${escape(row?.detail ?? '')}"></label>
      <label class="field"><span>وضعیت</span><select name="status">${options(states,row?.status ?? 'active')}</select></label>
      <footer class="dialog-actions">
        <button class="button primary" type="submit">ذخیرهٔ پرونده</button>
        <button class="button subtle" type="button" data-action="close">انصراف</button>
      </footer>
    </form></div>`;
  dialog.showModal();
}
function renderList() {
  const visible = records[kind].filter(row => (!status || status === row.status) && (!query || `${row.name} ${row.detail}`.includes(query)));
  document.querySelector('#record-count').textContent = `${number(visible.length)} پرونده · شعبهٔ مرکزی`;
  document.querySelector('#record-list').innerHTML = visible.length ? `<ul class="resource-list">${visible.map(row => `
    <li><button class="resource-row preview-row" data-action="edit" data-id="${row.id}">
      <span class="resource-avatar" aria-hidden="true">${escape(Array.from(row.name)[0])}</span>
      <span class="resource-name"><strong>${escape(row.name)}</strong><small>${escape(row.detail || '—')}</small></span>
      <span class="resource-branch">شعبهٔ مرکزی</span>
      <span class="resource-status is-${row.status}"><i></i>${states[row.status]}</span>
      <span class="resource-arrow" aria-hidden="true">‹</span></button></li>`).join('')}</ul>`
    : '<div class="empty-state"><strong>پرونده‌ای با این فیلتر پیدا نشد.</strong></div>';
}
function render() {
  root.innerHTML = `
    <header class="local-heading directory-heading">
      <div><h1>مدیریت ${kinds[kind].title}</h1><p>نمونهٔ تعاملی پنل مدیر</p></div>
      <button type="button" class="button primary" data-action="add">＋ ثبت ${kinds[kind].item}</button>
    </header>
    <div class="preview-tabs" role="group" aria-label="نوع پرونده">${Object.entries(kinds).map(([key,item]) =>
      `<button class="button subtle" data-action="tab" data-kind="${key}" aria-pressed="${kind === key}">${item.title}</button>`).join('')}</div>
    <section class="panel local-panel directory-panel">
      <div class="resource-filters preview-filters">
        <label class="field"><span>جست‌وجو</span><input type="search" id="query" value="${escape(query)}" placeholder="نام یا مشخصات"></label>
        <label class="field"><span>وضعیت</span><select id="status"><option value="">همهٔ وضعیت‌ها</option>${options(states,status)}</select></label>
      </div>
      <p id="record-count" class="local-notice"></p>
      <div id="record-list"></div>
    </section>`;
  renderList();
}
root.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'tab') {
    kind = action.dataset.kind;
    status = '';
    query = '';
    render();
    root.querySelector(`[data-kind="${kind}"]`).focus();
  } else if (action.dataset.action === 'add') openEditor();
  else if (action.dataset.action === 'edit') openEditor(records[kind].find(row => row.id === action.dataset.id));
});
root.addEventListener('input', event => {
  if (event.target.id !== 'query') return;
  query = event.target.value.trim();
  renderList();
});
root.addEventListener('change', event => {
  if (event.target.id !== 'status') return;
  status = event.target.value;
  renderList();
});
dialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="close"]')) dialog.close();
});
dialog.addEventListener('close', () => { if (origin?.isConnected) origin.focus(); });
dialog.addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(event.target);
  const name = String(values.get('name')).trim();
  const next = String(values.get('status'));
  if (!name || !Object.hasOwn(states,next)) return;
  const row = records[kind].find(item => item.id === event.target.dataset.id);
  const data = { name, detail: String(values.get('detail')).trim(), status: next };
  if (row) Object.assign(row,data);
  else records[kind].push({ id: crypto.randomUUID(), ...data });
  dialog.close();
  renderList();
  announcement.textContent = 'پروندهٔ آزمایشی ذخیره شد.';
});
render();
