import { Building2, Factory, FileText, LayoutDashboard, Settings2, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const ROOT_WORKSPACE_ITEMS = [
  { href: "/root/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/root/organizations", label: "Organizations", icon: Building2 },
  { href: "/root/plant", label: "Plants", icon: Factory },
  { href: "/root/users", label: "Users", icon: Users },
  { href: "/root/role-access", label: "Role & Access", icon: Settings2 },
  { href: "/root/report-format", label: "Report Format", icon: FileText },
];

export function RootWorkspaceNav() {
  const location = useLocation();

  return (
    <section className="rounded-xl border border-border/60 bg-card/70 p-2 backdrop-blur">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ROOT_WORKSPACE_ITEMS.map((item) => {
          const isActive = location.pathname === item.href || (item.href !== "/root/dashboard" && location.pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "inline-flex min-w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
