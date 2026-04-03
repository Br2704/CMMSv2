import { useNavigate } from "react-router-dom";
import { Factory, Building2, Boxes, Cog, ChevronRight } from "lucide-react";

interface HierarchyBreadcrumbProps {
  currentLevel: "plant" | "department" | "module" | "machine";
}

const levels = [
  { key: "plant", label: "Plant", icon: Factory, path: "/masters/plant" },
  { key: "department", label: "Department", icon: Building2, path: "/masters/departments" },
  { key: "module", label: "Module", icon: Boxes, path: "/masters/modules" },
  { key: "machine", label: "Machine", icon: Cog, path: "/masters/machines" },
];

export default function HierarchyBreadcrumb({ currentLevel }: HierarchyBreadcrumbProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      {levels.map((level, index) => {
        const Icon = level.icon;
        const isCurrent = level.key === currentLevel;
        const isClickable = !isCurrent;

        return (
          <div key={level.key} className="flex items-center gap-2">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <button
              onClick={() => isClickable && navigate(level.path)}
              disabled={!isClickable}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 hover:bg-primary/20 cursor-pointer"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="font-medium">{level.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
