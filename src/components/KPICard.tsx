import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";

interface KPICardProps {
  label: string;
  value: number | string;
  format?: (n: number) => string;
  delta?: number; // pct
  hint?: string;
  icon?: ReactNode;
  accent?: "teal" | "azure" | "gold" | "neutral";
  index?: number;
  hidden?: boolean;
  onToggleHidden?: () => void;
  extra?: ReactNode;
}

const ACCENTS = {
  teal: "var(--gradient-primary)",
  azure: "linear-gradient(135deg, oklch(0.66 0.20 255), oklch(0.5 0.18 270))",
  gold: "var(--gradient-gold)",
  neutral: "linear-gradient(135deg, oklch(0.4 0.02 265), oklch(0.3 0.02 265))",
} as const;

export function KPICard({
  label,
  value,
  format,
  delta,
  hint,
  icon,
  accent = "teal",
  index = 0,
}: KPICardProps) {
  const numeric = typeof value === "number";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className="glass-card p-5 relative overflow-hidden group"
    >
      <div
        className="absolute -top-12 -right-12 w-36 h-36 rounded-full opacity-20 blur-2xl group-hover:opacity-30 transition-opacity"
        style={{ background: ACCENTS[accent] }}
      />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        {icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-primary-foreground"
            style={{ background: ACCENTS[accent] }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="font-display text-3xl font-semibold tracking-tight">
        {numeric && format ? <Counter value={value as number} format={format} /> : <>{value}</>}
      </div>
      <div className="flex items-center justify-between mt-2 min-h-5">
        <div className="text-xs text-muted-foreground truncate">{hint}</div>
        {delta != null && (
          <div
            className={`text-xs flex items-center gap-1 font-medium ${
              delta >= 0 ? "text-success" : "text-destructive"
            }`}
          >
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {(delta * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Counter({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [mv, value]);
  return <motion.span>{rounded}</motion.span>;
}
