// Copied from Remora's apps/web/src/components/app/empty-state.tsx (ADR-0066).
/** The one empty state (ADR-0036): icon, title, one sentence, one next step. */
import { cn } from "cn";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("gap-2 border p-4 md:p-4", className)}>
      <EmptyHeader className="gap-1">
        <EmptyMedia
          variant="icon"
          className="mb-1 size-7 rounded-md [&_svg:not([class*='size-'])]:size-4"
        >
          {icon}
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription className="text-xs">{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent className="gap-2 text-xs">{action}</EmptyContent> : null}
    </Empty>
  );
}
