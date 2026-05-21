import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
}

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Currency input (BRL). Stores numeric reais; formats live as the user types.
 * Type 1000 → shows "R$ 10,00"; type 100000 → "R$ 1.000,00".
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, placeholder = "R$ 0,00", ...props }, ref) => {
    const cents = value == null ? 0 : Math.round(value * 100);
    const display = value == null || value === 0 ? "" : fmt(cents);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "");
      if (!digits) {
        onValueChange(null);
        return;
      }
      const newCents = parseInt(digits, 10);
      onValueChange(newCents / 100);
    };

    return (
      <Input
        ref={ref}
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(className)}
        {...props}
      />
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
