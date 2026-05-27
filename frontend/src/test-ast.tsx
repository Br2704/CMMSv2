import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

export function Test() {
  return (
    <Button asChild>
      <Settings /> Something
    </Button>
  );
}
