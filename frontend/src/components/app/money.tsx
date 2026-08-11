"use client";

import { cn } from "@/lib/utils";

/**
 * Currency-correct formatting. The previous `formatMoney` hardcoded `$` regardless of the
 * expense's actual currency, so an INR expense rendered as "$1,200".
 */
export function formatMoney(
  amount: number,
  currency = "USD",
  opts: { signed?: boolean; compact?: boolean } = {},
) {
  const value = Number(amount) || 0;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: opts.compact && Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (!opts.signed) return value < 0 ? `-${formatted}` : formatted;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

/** Money with semantic colour: positive = you're owed, negative = you owe. */
export function MoneyText({
  amount,
  currency,
  signed = false,
  tone = "auto",
  className,
}: {
  amount: number;
  currency?: string;
  signed?: boolean;
  /** "auto" colours by sign; "neutral" keeps the inherited colour. */
  tone?: "auto" | "neutral";
  className?: string;
}) {
  const value = Number(amount) || 0;
  return (
    <span
      className={cn(
        "tabular font-semibold",
        tone === "auto" && value > 0 && "text-positive",
        tone === "auto" && value < 0 && "text-negative",
        className,
      )}
    >
      {formatMoney(value, currency, { signed })}
    </span>
  );
}
