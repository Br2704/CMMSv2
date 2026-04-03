import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction } from "lucide-react";
import { useLocation } from "react-router-dom";

export default function ComingSoon() {
  const location = useLocation();
  const pageName = location.pathname
    .split("/")
    .pop()
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Page";

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <Card className="shadow-card max-w-md">
          <CardContent className="pt-8 pb-8">
            <div className="flex justify-center mb-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Construction className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-2">{pageName}</h1>
            <p className="text-muted-foreground mb-6">
              This feature is currently under development. Check back soon for updates!
            </p>
            <Button
              variant="outline"
              onClick={() => window.history.back()}
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
