/**
 * The page frame, after Remora's components/app/page.tsx, page-header.tsx and section.tsx (ADR-0066).
 * `Page` is the one place that decides a page's width, padding and document title, and it tells the
 * shell the title shown in the phone header. `PageHeader` and `Section` keep one heading scale.
 */
import { cn } from "cn";
import { createContext, type ReactNode, useContext, useEffect } from "react";

export const ShellTitle = createContext<((title: string) => void) | null>(null);

export function Page({
  title,
  children,
  className,
}: {
  /** Also the document title: "Board" renders "Board · Receipts". */
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const setTitle = useContext(ShellTitle);
  useEffect(() => {
    document.title = title === "Receipts" ? "Receipts" : `${title} · Receipts`;
    setTitle?.(title);
  }, [title, setTitle]);
  return (
    <div
      data-slot="page-column"
      className={cn("flex w-full flex-col gap-6 px-4 py-6 sm:px-6 md:py-8 lg:px-10", className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {badge}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="flex min-h-8 items-center text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
