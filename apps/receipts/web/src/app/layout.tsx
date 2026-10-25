/**
 * Remora's app shell (ADR-0066, after apps/web/src/app/app-layout.tsx and app-sidebar.tsx): an inset
 * sidebar with the logo, the groups and the current group's pages, the wallet in its footer, and a
 * thin top bar with the sidebar toggle and the network. On a phone the sidebar is a sheet.
 */

import { cn } from "cn";
import { Bot, Brain, ChartLine, Layers, Ticket, Trophy } from "lucide-react";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { Link, NavLink, Outlet, useLocation, useMatch, useParams } from "react-router";
import { NetworkPill } from "@/components/app/network-pill";
import { Page, PageHeader, ShellTitle } from "@/components/app/page";
import { ThemeSync } from "@/components/app/theme-choice";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { AccountMenu } from "@/components/wallet";
import { ago } from "../format.ts";
import { useGroup, useGroups } from "../hooks.ts";

/** The group the sidebar shows pages for: the one in the URL, or the receipt's. */
const CurrentGroup = createContext<{ id: string | null; set: (id: string) => void }>({
  id: null,
  set: () => {},
});

/** A receipt page names its group, so the sidebar keeps that group's pages. */
export function useShowGroup(id: string | undefined) {
  const { set } = useContext(CurrentGroup);
  useEffect(() => {
    if (id) set(id);
  }, [id, set]);
}

export const GROUP_PAGES = [
  { to: "", label: "Board", icon: Ticket, end: true },
  { to: "scores", label: "Leaderboard", icon: Trophy },
  { to: "learning", label: "Learning", icon: ChartLine },
  { to: "agents", label: "Agents", icon: Bot },
  { to: "memory", label: "Memory", icon: Brain },
] as const;

function AppSidebar({ groupId }: { groupId: string | null }) {
  const { state, setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const { pathname } = useLocation();
  const collapsed = state === "collapsed";
  const groups = useGroups();
  const current = groups.data?.find((g) => g.id === groupId);
  const others = (groups.data ?? []).filter((g) => g.id !== groupId).slice(0, 8);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <Link to="/" className="flex items-center rounded-md px-2 py-1.5" onClick={close}>
          <Logo size={collapsed ? 24 : 28} withText={!collapsed} />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="All groups">
                  <Link to="/" onClick={close}>
                    <Layers />
                    <span>All groups</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groupId ? (
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">
              {current?.name ?? "This group"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {GROUP_PAGES.map(({ to, label, icon: Icon }) => {
                  const href = `/g/${groupId}${to ? `/${to}` : ""}`;
                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                        <Link to={href} onClick={close}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {!collapsed && others.length ? (
          <SidebarGroup>
            <SidebarGroupLabel>{groupId ? "Other groups" : "Groups"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {others.map((g) => (
                  <SidebarMenuItem key={g.id}>
                    <SidebarMenuButton asChild>
                      <Link to={`/g/${g.id}`} onClick={close}>
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout() {
  const [title, setTitle] = useState("receipts");
  const [shown, setShown] = useState<string | null>(null);
  const inGroup = useMatch("/g/:id/*");
  const groupId = inGroup?.params.id ?? shown;

  return (
    <ShellTitle.Provider value={setTitle}>
      <CurrentGroup.Provider value={{ id: groupId, set: setShown }}>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 60)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as CSSProperties
          }
        >
          <AppSidebar groupId={groupId} />
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center border-b bg-background/95 backdrop-blur md:rounded-t-xl">
              <div className="flex w-full items-center gap-1 px-2">
                <SidebarTrigger className="size-8" />
                <p className="min-w-0 flex-1 truncate pl-1 text-sm text-muted-foreground md:hidden">
                  {title}
                </p>
                <div className="hidden flex-1 md:block" />
                <NetworkPill />
              </div>
            </header>
            <div className="flex min-w-0 flex-1 flex-col">
              <Outlet />
            </div>
            <footer className="border-t px-4 py-5 text-center text-xs text-muted-foreground sm:px-6 lg:px-10">
              Picks are signed by your wallet and anchored on Sui testnet. What Receipts learns
              lives in Walrus Memory.
            </footer>
          </SidebarInset>
        </SidebarProvider>
        <ThemeSync />
      </CurrentGroup.Provider>
    </ShellTitle.Provider>
  );
}

/** On a phone the sidebar hides, so a group's pages also get a segmented row under the title. */
function PhoneTabs({ id }: { id: string }) {
  return (
    <nav
      aria-label="Group pages"
      className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 md:hidden"
    >
      {GROUP_PAGES.map((t) => (
        <NavLink
          key={t.label}
          to={`/g/${id}${t.to ? `/${t.to}` : ""}`}
          end={"end" in t}
          className={({ isActive }) =>
            cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm font-medium",
              isActive
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** A group's pages share its title block. */
export function GroupLayout() {
  const { id = "" } = useParams();
  const group = useGroup(id);
  const { pathname } = useLocation();
  const tab =
    GROUP_PAGES.find((t) => t.to && pathname.endsWith(`/${t.to}`))?.label ?? GROUP_PAGES[0].label;
  const name = group.data?.name ?? (group.isError ? "Group not found" : "…");
  const members = group.data?.members.length ?? 0;
  return (
    <Page title={group.data ? `${tab} · ${group.data.name}` : tab}>
      <PageHeader
        eyebrow="Group"
        title={name}
        badge={group.data?.telegram ? <Badge variant="outline">Telegram</Badge> : null}
        description={
          group.data
            ? `${members} member${members === 1 ? "" : "s"} · started ${ago(group.data.createdAt)}`
            : null
        }
      />
      <PhoneTabs id={id} />
      <Outlet />
    </Page>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl">{children}</div>;
}
