import { Link, NavLink, Outlet, useParams } from "react-router";
import { useGroup } from "../hooks.ts";
import { cx } from "./ui.tsx";
import { WalletButton } from "./wallet.tsx";

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span>Receipts</span>
            <span className="hidden rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted sm:inline">
              testnet
            </span>
          </Link>
          <WalletButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Picks are signed by your wallet and anchored on Sui testnet. What Receipts learns lives in
        Walrus Memory.
      </footer>
    </div>
  );
}

const TABS = [
  { to: "", label: "Board", end: true },
  { to: "scores", label: "Leaderboard" },
  { to: "learning", label: "Learning" },
  { to: "memory", label: "Memory" },
];

/** A group's pages share its name and the tabs. */
export function GroupLayout() {
  const { id = "" } = useParams();
  const group = useGroup(id);
  return (
    <div>
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Group</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {group.data?.name ?? (group.isError ? "Group not found" : "…")}
        </h1>
      </div>
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={`/g/${id}${t.to ? `/${t.to}` : ""}`}
            end={t.end ?? false}
            className={({ isActive }) =>
              cx(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                isActive ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
