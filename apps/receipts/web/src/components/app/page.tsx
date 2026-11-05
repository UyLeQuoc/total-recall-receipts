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
      className={cn("flex w-full flex-col gap-4 px-4 py-4 lg:px-6", className)}
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
  meta,
  titleClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className={cn("min-w-0 text-lg font-semibold tracking-tight", titleClassName)}>
            {title}
          </h1>
          {badge}
          {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
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
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
