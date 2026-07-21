/* eslint-disable react/prop-types */
// Canvas design runtime editable source marker: ui-components
// shadcn 风格基础组件，颜色/圆角/间距经 var(--seed-*) 派生以支持 Nudge 微调
import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Check, ChevronDown, Loader2, X, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/* ---------- Button ---------- */
export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[var(--radius)] font-medium tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--seed-primary)_85%,var(--seed-fg)_15%)] shadow-sm",
        outline: "border border-border bg-card text-foreground hover:bg-[var(--seed-surface-2)]",
        ghost: "text-foreground hover:bg-[var(--seed-surface-2)]",
        subtle: "bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] hover:bg-[color-mix(in_srgb,var(--seed-primary)_22%,var(--seed-bg))]",
        success: "bg-[var(--success)] text-[var(--success-foreground)] hover:opacity-90 shadow-sm",
        danger: "bg-[var(--danger)] text-[var(--danger-foreground)] hover:opacity-90 shadow-sm",
        link: "text-[var(--seed-primary-strong)] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] gap-1.5",
        md: "h-10 px-4 text-sm gap-2",
        lg: "h-12 px-6 text-[15px] gap-2",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

export function Button({ variant, size, className, children, disabled, loading, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      data-component="Button"
      {...props}
    >
      {asChild ? children : (<>{loading && <Loader2 className="w-4 h-4 animate-spin" />}{children}</>)}
    </Comp>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-card text-card-foreground shadow-[var(--shadow-sm)]",
        className
      )}
      data-component="Card"
      {...props}
    >
      {children}
    </div>
  );
}
export function CardHeader({ className, children, ...props }) {
  return <div className={cn("p-5 sm:p-6 flex flex-col gap-1.5", className)} {...props}>{children}</div>;
}
export function CardTitle({ className, children, ...props }) {
  return <h3 className={cn("text-[1.0625rem]", className)} {...props}>{children}</h3>;
}
export function CardDescription({ className, children, ...props }) {
  return <p className={cn("text-[13px] text-muted-foreground leading-[1.5]", className)} {...props}>{children}</p>;
}
export function CardContent({ className, children, ...props }) {
  return <div className={cn("p-5 sm:p-6 pt-0", className)} {...props}>{children}</div>;
}
export function CardFooter({ className, children, ...props }) {
  return <div className={cn("p-5 sm:p-6 pt-0 flex items-center gap-2", className)} {...props}>{children}</div>;
}

/* ---------- Input / Label / Textarea ---------- */
export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius)] border border-border bg-input px-3 text-sm text-foreground placeholder:text-[color-mix(in_srgb,var(--seed-muted)_70%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:border-[color-mix(in_srgb,var(--seed-primary)_45%,transparent)] disabled:opacity-50",
        className
      )}
      data-component="Input"
      {...props}
    />
  );
}
export function Label({ className, children, ...props }) {
  return <label className={cn("text-[13px] font-medium tracking-[0.01em] text-foreground", className)} {...props}>{children}</label>;
}
export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "min-h-[80px] w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-[color-mix(in_srgb,var(--seed-muted)_70%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        className
      )}
      data-component="Textarea"
      {...props}
    />
  );
}

/* ---------- Badge ---------- */
const badgeVariants = {
  default: "bg-[var(--primary-muted)] text-[var(--seed-primary-strong)]",
  outline: "border border-border text-foreground",
  muted: "bg-[color-mix(in_srgb,var(--seed-muted)_14%,var(--seed-bg))] text-[var(--muted)]",
  success: "bg-[var(--success-muted)] text-[var(--success)]",
  warning: "bg-[var(--warning-muted)] text-[var(--warning)]",
  danger: "bg-[var(--danger-muted)] text-[var(--danger)]",
};
export function Badge({ variant = "default", className, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-0.5 text-[12px] font-medium tracking-[0.01em] leading-[1.4]",
        badgeVariants[variant],
        className
      )}
      data-component="Badge"
      {...props}
    >
      {children}
    </span>
  );
}

/* ---------- StatusBadge（任务状态机） ---------- */
const statusLabel = {
  queued: "排队中",
  running: "运行中",
  retry_wait: "等待重试",
  succeeded: "已完成",
  failed: "已失败",
  cancelled: "已取消",
  verification_required: "待人工核验",
};
export function StatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-0.5 text-[12px] font-medium tracking-[0.01em] leading-[1.4]",
        `status-${status}`,
        status === "verification_required" && "is-pulse",
        className
      )}
      data-component="StatusBadge"
      data-od-id={`status-${status}`}
    >
      {status === "succeeded" && <CheckCircle2 className="w-3 h-3" />}
      {status === "verification_required" && <AlertTriangle className="w-3 h-3" />}
      <span>{statusLabel[status] || status}</span>
    </span>
  );
}

/* ---------- Alert ---------- */
const alertStyles = {
  info: { cls: "border-[color-mix(in_srgb,var(--seed-muted)_30%,transparent)] bg-[var(--seed-surface-2)]", icon: Info, iconCls: "text-[var(--muted)]" },
  warning: { cls: "border-[color-mix(in_srgb,var(--seed-warning)_40%,transparent)] bg-[var(--warning-muted)]", icon: AlertTriangle, iconCls: "text-[var(--warning)]" },
  danger: { cls: "border-[color-mix(in_srgb,var(--seed-danger)_40%,transparent)] bg-[var(--danger-muted)]", icon: AlertTriangle, iconCls: "text-[var(--danger)]" },
  success: { cls: "border-[color-mix(in_srgb,var(--seed-success)_40%,transparent)] bg-[var(--success-muted)]", icon: CheckCircle2, iconCls: "text-[var(--success)]" },
};
export function Alert({ variant = "info", title, children, className }) {
  const s = alertStyles[variant] || alertStyles.info;
  const Icon = s.icon;
  return (
    <div className={cn("flex gap-3 rounded-[var(--radius)] border p-4", s.cls, className)} role="status" data-component="Alert">
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", s.iconCls)} />
      <div className="flex-1 text-[13px] leading-[1.55]">
        {title && <div className="font-medium text-foreground tracking-[0.01em] mb-0.5">{title}</div>}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Spinner ---------- */
export function Spinner({ className }) {
  return <Loader2 className={cn("w-4 h-4 animate-spin text-[var(--muted)]", className)} />;
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 p-10 text-center rounded-[var(--radius)] border border-dashed border-border", className)} data-component="EmptyState">
      {Icon && <Icon className="w-7 h-7 text-[color-mix(in_srgb,var(--seed-muted)_60%,transparent)]" />}
      <div>
        <div className="text-sm font-medium text-foreground tracking-[0.01em]">{title}</div>
        {description && <div className="text-[13px] text-muted-foreground mt-1 max-w-[42ch]">{description}</div>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Select（原生样式） ---------- */
export function Select({ className, children, ...props }) {
  return (
    <div className="relative" data-component="Select">
      <select
        className={cn(
          "h-10 w-full appearance-none rounded-[var(--radius)] border border-border bg-input pl-3 pr-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
    </div>
  );
}

/* ---------- Dialog（简易 modal） ---------- */
export function Dialog({ open, onClose, title, description, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-component="Dialog">
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--seed-fg)_35%,transparent)] backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-card p-5 sm:p-6 shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-[1.0625rem]">{title}</h3>
            {description && <p className="text-[13px] text-muted-foreground mt-1">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭" className="-mr-1 h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-5">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Table ---------- */
export function Table({ head, rows, className }) {
  return (
    <div className="w-full overflow-x-auto rounded-[var(--radius)] border border-border" data-component="Table">
      <table className="w-full text-sm">
        <thead className="bg-[var(--seed-surface-2)]">
          <tr>{head.map((h, i) => <th key={i} className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-border hover:bg-[var(--seed-surface-2)]">
              {row.map((cell, ci) => <td key={ci} className="px-4 py-3 align-middle">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Checkbox ---------- */
export function Checkbox({ checked, onChange, className, ...props }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "w-5 h-5 rounded-[var(--radius-sm)] border flex items-center justify-center transition-colors",
        checked ? "bg-[var(--seed-primary)] border-[var(--seed-primary)] text-[var(--primary-foreground)]" : "border-border bg-input",
        className
      )}
      data-component="Checkbox"
      {...props}
    >
      {checked && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}
