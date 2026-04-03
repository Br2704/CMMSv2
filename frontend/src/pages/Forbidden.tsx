import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">403 - Forbidden</h1>
          <p className="mt-1 text-sm text-muted-foreground">You do not have access to this page.</p>
        </div>
        <Button asChild>
          <Link to="/">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
