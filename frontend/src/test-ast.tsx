import { Button } from "@/components/ui/button";
import { Icon } from "lucide-react";

export function Test() {
  return (
    <Button asChild>
      Something <Icon />
    </Button>
  );
}
