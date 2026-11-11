export const operationsTabs={packages:'بسته و عضویت',expenses:'هزینه‌ها',coaches:'تسویهٔ مربیان',rates:'تعرفهٔ ویژه'} as const;
export type OperationsTab=keyof typeof operationsTabs;
export const clubFinanceCommands={
  'finance-training-issue':'training_issue','finance-training-status':'training_status',
  'finance-training-redeem':'training_redeem','finance-training-return':'training_return',
  'finance-expense-record':'expense_record','finance-expense-void':'expense_void',
  'finance-coach-adjust':'coach_adjust','finance-coach-approve':'coach_approve',
  'finance-coach-pay':'coach_pay','finance-coach-correct':'coach_correct',
  'finance-rate-special':'rate_special','finance-rate-retire':'rate_retire',
} as const;
export type ClubFinanceCommand=keyof typeof clubFinanceCommands;
export function isClubFinanceCommand(value:string):value is ClubFinanceCommand {
  return Object.hasOwn(clubFinanceCommands,value);
}
export function operationsPath(org:string,branch:string,tab:OperationsTab,filters:Record<string,string>={}) {
  return `/club/${org}/finance/operations?${new URLSearchParams({branch,tab,...filters})}`;
}
export function commandTab(command:ClubFinanceCommand):OperationsTab {
  if (command.startsWith('finance-training-')) return 'packages';
  if (command.startsWith('finance-expense-')) return 'expenses';
  if (command.startsWith('finance-coach-')) return 'coaches';
  return 'rates';
}
export const expenseCategories={maintenance:'تعمیر و نگهداری',equipment:'تجهیزات',utilities:'آب، برق و خدمات',rent:'اجاره',other:'سایر'} as const;
export const coachBases={hourly:'ساعتی',per_session:'ثابت هر جلسه',revenue_share:'درصد دریافتی خالص',agreement:'توافق اختصاصی'} as const;
export const payableStates={pending:'محاسبه‌نشده',ready:'آمادهٔ بررسی',adjusted:'اصلاح‌شده',approved:'تأییدشده',paid:'پرداخت‌شده'} as const;
