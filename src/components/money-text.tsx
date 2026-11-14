import { formatMinorParts } from '@/lib/money';

export function MoneyText({
  amount,
  currency,
  className,
}: {
  amount: string | bigint;
  currency: string;
  className?: string;
}) {
  const { formatted, unit } = formatMinorParts(amount, currency);
  return (
    <span className={className ? `money-pair ${className}` : 'money-pair'}>
      <bdi dir="ltr" className="money-digits">{formatted}</bdi>
      <span className="money-unit">{unit}</span>
    </span>
  );
}
