import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth.store";
import { isRootAdmin, isSuperAdmin, hasRole } from "@/lib/permission-engine";
import {
  Factory,
  Building2,
  Layers,
  Cog,
  Landmark,
  Truck,
  Users,
  ShieldCheck,
  Calendar,
  Gauge,
  Clock,
  Wrench,
  Link2,
  Leaf,
  DoorOpen,
  Mail,
  ClipboardList,
} from "lucide-react";

const masterPages = [
  {
    name: "Plant",
    description: "Manage plant locations and details",
    href: "/masters/plant",
    icon: Factory,
    color: "bg-blue-500",
    moduleId: "masters.plant",
  },
  {
    name: "Department",
    description: "Configure departments and sub-departments",
    href: "/masters/departments",
    icon: Building2,
    color: "bg-indigo-500",
    moduleId: "masters.departments",
  },
  {
    name: "Module",
    description: "Enable/disable system modules",
    href: "/masters/modules",
    icon: Layers,
    color: "bg-purple-500",
    moduleId: "masters.modules",
  },
  {
    name: "Machine",
    description: "Manage machine categories and types",
    href: "/masters/machines",
    icon: Cog,
    color: "bg-pink-500",
    moduleId: "masters.machines",
  },
  {
    name: "Cost Center",
    description: "Configure cost center hierarchy",
    href: "/masters/cost-centers",
    icon: Landmark,
    color: "bg-rose-500",
    moduleId: "masters.cost-centers",
  },
  {
    name: "Vendor",
    description: "Manage vendor/supplier database",
    href: "/masters/vendors",
    icon: Truck,
    color: "bg-orange-500",
    moduleId: "masters.vendors",
  },
  {
    name: "User",
    description: "User management and profiles",
    href: "/masters/users",
    icon: Users,
    color: "bg-amber-500",
    moduleId: "masters.users",
  },
  {
    name: "PM/PD",
    description: "Preventive maintenance frequencies",
    href: "/masters/pm-config",
    icon: Calendar,
    color: "bg-cyan-500",
    moduleId: "masters.pm-config",
  },
  {
    name: "Calibration",
    description: "Calibration templates, methods, and linked schedules",
    href: "/masters/calibration-config",
    icon: Gauge,
    color: "bg-fuchsia-500",
    moduleId: "masters.calibration-config",
  },
  {
    name: "AMC Master",
    description: "Configure AMC contracts, covered machines, SLAs, and vendor portal users",
    href: "/masters/amc-config",
    icon: ShieldCheck,
    color: "bg-amber-600",
    moduleId: "masters.amc-config",
  },
  {
    name: "ESG Master",
    description: "Configure KPIs, targets, emission factors, and plant ESG owners",
    href: "/masters/esg-config",
    icon: Leaf,
    color: "bg-emerald-600",
    moduleId: "masters.esg-config",
  },
  {
    name: "Gate Master",
    description: "Manage gate locations and gate-wise entry template configuration",
    href: "/masters/gates",
    icon: DoorOpen,
    color: "bg-red-500",
    moduleId: "masters.gates",
  },
  {
    name: "Safety Config",
    description: "Configure safety metrics, aggregation, and targets",
    href: "/masters/safety-config",
    icon: ShieldCheck,
    color: "bg-orange-600",
    moduleId: "masters.safety-config",
  },
  {
    name: "Email Reports",
    description: "Schedule report mails, recipients, and sections",
    href: "/masters/email-reports",
    icon: Mail,
    color: "bg-cyan-700",
    moduleId: "masters.email-reports",
  },
  {
    name: "Log Templates",
    description: "Build structured operational log templates and assignments",
    href: "/masters/log-templates",
    icon: ClipboardList,
    color: "bg-slate-700",
    moduleId: "masters.log-templates",
  },
  {
    name: "Machine Instruments",
    description: "Register instruments under machines for calibration",
    href: "/masters/machine-instruments",
    icon: Gauge,
    color: "bg-violet-600",
    moduleId: "masters.machine-instruments",
  },
  {
    name: "Shift",
    description: "Configure plant shifts for data logging",
    href: "/masters/shifts",
    icon: Clock,
    color: "bg-lime-600",
    moduleId: "masters.shifts",
  },
  {
    name: "Maintenance Teams",
    description: "Create teams, leaders, and member groups",
    href: "/masters/maintenance-teams",
    icon: Wrench,
    color: "bg-teal-600",
    moduleId: "masters.maintenance-teams",
  },
  {
    name: "Work Order Config",
    description: "Manage work order categories, types, failure codes, and dept routing",
    href: "/masters/work-order-config",
    icon: Link2,
    color: "bg-sky-600",
    moduleId: "masters.workorder-team-mapping",
  },
  {
    name: "SLA & Escalation",
    description: "Configure SLAs, escalation matrix, and reminder intervals",
    href: "/masters/sla-config",
    icon: Landmark,
    color: "bg-red-600",
    moduleId: "masters.sla-config",
  },
];

const rootMasterPages = [
  {
    name: "Organization",
    description: "Manage organizations and branding",
    href: "/root/organizations",
    icon: Building2,
    color: "bg-blue-600",
    moduleId: "root.organizations",
  },
  {
    name: "Plant",
    description: "Manage plants under organizations",
    href: "/root/plant",
    icon: Factory,
    color: "bg-indigo-600",
    moduleId: "root.plants",
  },
  {
    name: "User Management",
    description: "Manage Superadmins and Admins organization-wise",
    href: "/root/users",
    icon: Users,
    color: "bg-emerald-600",
    moduleId: "root.users",
  },
  {
    name: "Role & Access Control",
    description: "Manage governance permissions",
    href: "/root/role-access",
    icon: ShieldCheck,
    color: "bg-slate-600",
    moduleId: "root.role-access",
  },
  {
    name: "SLA & Escalation",
    description: "Configure SLAs, escalation matrix, and reminder intervals",
    href: "/masters/sla-config",
    icon: Landmark,
    color: "bg-red-600",
    moduleId: "root.sla-config",
  },
];

export default function Masters() {
  const { user } = useAuthStore();
  const isRootUser = isRootAdmin(user?.roles ?? []);
  const { hasModuleAccess, loading } = usePermissions();
  const effectivePages = isRootUser ? rootMasterPages : masterPages;
  const showSkeleton = !isRootUser && loading;

  const isAdminOrSuper = (isSuperAdmin(user?.roles ?? []) || hasRole(user?.roles ?? [], "PLANT_ADMIN")) && !isRootAdmin(user?.roles ?? []);

  const visibleItems = effectivePages.filter((item) => {
    if (isRootUser) return true;
    if (showSkeleton) return false;
    if (item.href === "/masters/sla-config") {
      return isAdminOrSuper;
    }
    return hasModuleAccess(item.moduleId, "view");
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const }}
      className="space-y-4 sm:space-y-6"
    >
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Masters</h1>
        <p className="text-sm text-muted-foreground">
          {isRootUser ? "Governance masters for organizations, plants, and role access" : "Configure and manage all system master data"}
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {showSkeleton
          ? Array.from({ length: 8 }).map((_, index) => (
              <motion.div
                key={`master-skeleton-${index}`}
                variants={cardVariants}
              >
                <Card className="animate-pulse shadow-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted" />
                      <div className="h-4 w-28 rounded bg-muted" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="h-4 w-full rounded bg-muted" />
                  </CardContent>
                </Card>
              </motion.div>
            ))
          : visibleItems.map((item, index) => (
          <motion.div key={item.href} variants={cardVariants}>
            <Link to={item.href}>
              <Card className="shadow-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 cursor-pointer group border border-border/50 hover:border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2.5 ${item.color} text-white shadow-sm transition-transform duration-300 group-hover:scale-110`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">
                      {item.name}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground group-hover:text-foreground/80 transition-colors">{item.description}</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
