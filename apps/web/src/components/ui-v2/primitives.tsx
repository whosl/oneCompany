import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--oc-accent-primary)] bg-[var(--oc-accent-primary)] text-white hover:brightness-95",
        secondary:
          "border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] text-[var(--oc-text-primary)] hover:bg-[var(--oc-surface-raised)]",
        ghost:
          "border-transparent bg-transparent text-[var(--oc-text-muted)] hover:bg-[var(--oc-surface-raised)] hover:text-[var(--oc-text-primary)]",
        danger:
          "border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 text-[var(--oc-status-danger)] hover:bg-[var(--oc-status-danger)]/15",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export function UiButton({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function UiIconButton({
  label,
  title = label,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> &
  VariantProps<typeof buttonVariants> & {
    label: string;
  }) {
  return <UiButton aria-label={label} title={title} size="icon" {...props} />;
}

export function UiPanel({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)]",
        className,
      )}
      {...props}
    />
  );
}

export type UiStatusTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const statusToneClass: Record<UiStatusTone, string> = {
  neutral:
    "border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] text-[var(--oc-text-muted)]",
  accent:
    "border-[var(--oc-accent-primary)]/45 bg-[var(--oc-accent-soft)] text-[var(--oc-accent-primary)]",
  success:
    "border-[var(--oc-status-success)]/45 bg-[var(--oc-status-success)]/10 text-[var(--oc-status-success)]",
  warning:
    "border-[var(--oc-status-warning)]/50 bg-[var(--oc-status-warning)]/10 text-[var(--oc-status-warning)]",
  danger:
    "border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 text-[var(--oc-status-danger)]",
  info:
    "border-[var(--oc-status-info)]/45 bg-[var(--oc-status-info)]/10 text-[var(--oc-status-info)]",
};

export function uiStatusClass(tone: UiStatusTone): string {
  return statusToneClass[tone];
}

export function UiStatusPill({
  label,
  tone = "neutral",
  dot = true,
  className,
}: {
  label: string;
  tone?: UiStatusTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        statusToneClass[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export function UiTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  className,
}: {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-1 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={cn(
            "h-8 rounded px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35",
            activeTab === tab
              ? "bg-[var(--oc-surface-base)] text-[var(--oc-accent-primary)] shadow-sm"
              : "text-[var(--oc-text-muted)] hover:text-[var(--oc-text-primary)]",
          )}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function UiEmptyState({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center",
        className,
      )}
    >
      {icon ? <div className="text-[var(--oc-text-muted)]">{icon}</div> : null}
      <p className="text-sm font-medium text-[var(--oc-text-primary)]">{title}</p>
      {description ? <p className="max-w-sm text-xs text-[var(--oc-text-muted)]">{description}</p> : null}
    </div>
  );
}

export function UiCodeBlock({ className, ...props }: ComponentPropsWithoutRef<"pre">) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-code)] p-3 font-mono text-xs leading-5 text-[var(--oc-text-on-code)]",
        className,
      )}
      {...props}
    />
  );
}

export function UiLogBlock({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "overflow-auto rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-code)] p-3 font-mono text-xs leading-5 text-[var(--oc-text-on-code)]",
        className,
      )}
      {...props}
    />
  );
}

export function UiSectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[var(--oc-text-primary)]">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-[var(--oc-text-muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function UiInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 min-w-0 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 text-sm text-[var(--oc-text-primary)] outline-none placeholder:text-[var(--oc-text-muted)] focus:border-[var(--oc-border-active)] focus:ring-2 focus:ring-[var(--oc-border-active)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function UiTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 min-w-0 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 py-2 text-sm text-[var(--oc-text-primary)] outline-none placeholder:text-[var(--oc-text-muted)] focus:border-[var(--oc-border-active)] focus:ring-2 focus:ring-[var(--oc-border-active)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function UiSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 min-w-0 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 text-sm text-[var(--oc-text-primary)] outline-none focus:border-[var(--oc-border-active)] focus:ring-2 focus:ring-[var(--oc-border-active)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function UiDialog({
  open,
  title,
  description,
  onClose,
  children,
  className,
  testId,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-overlay)] p-0 sm:p-4"
      data-testid={testId}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] shadow-xl sm:h-auto sm:max-h-[88vh] sm:rounded-lg",
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--oc-border-muted)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--oc-text-primary)]">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-[var(--oc-text-muted)]">{description}</p>
            ) : null}
          </div>
          <UiIconButton label={`Close ${title}`} size="icon-sm" variant="ghost" onClick={onClose}>
            <X />
          </UiIconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
