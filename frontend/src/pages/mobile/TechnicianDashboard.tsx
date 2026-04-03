import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardList, ShieldCheck, Wrench, GaugeCircle, CalendarClock, ScanLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dbClient } from "@/api/dbClient";
import { useNotifications } from "@/hooks/useNotifications";
import { getQueuedMutationCount } from "@/mobile/indexedDb";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function TechnicianDashboard() {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications({ enabled: true });
  const [queuedCount, setQueuedCount] = useState(0);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const refreshQueue = () => {
      void getQueuedMutationCount().then(setQueuedCount).catch(() => undefined);
    };
    refreshQueue();

    const onSync = () => {
      refreshQueue();
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("cmms:offline-sync", onSync as EventListener);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("cmms:offline-sync", onSync as EventListener);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  const { data: workOrders = [] } = useQuery({
    queryKey: ["technician_assigned_workorders"],
    queryFn: async () => {
      const { data, error } = await dbClient.from("work_orders").select("id, wo_number, status, category").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const assigned = workOrders.filter((wo: any) => wo.status !== "CLOSED").length;
    const pm = workOrders.filter((wo: any) => wo.category === "PREVENTIVE").length;
    const calibration = workOrders.filter((wo: any) => wo.category === "CALIBRATION").length;
    const amc = workOrders.filter((wo: any) => wo.category === "AMC").length;
    return { assigned, pm, calibration, amc };
  }, [workOrders]);

  const requestBrowserNotifications = async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") return;
    await Notification.requestPermission();
  };

  const installPwa = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPromptEvent(null);
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Technician Mode</CardTitle>
          <p className="text-xs text-muted-foreground">Quick access for factory-floor workflows</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button className="h-14 justify-start gap-2" onClick={() => navigate("/work-orders")}><ClipboardList className="h-5 w-5" />Assigned WOs</Button>
          <Button className="h-14 justify-start gap-2" onClick={() => navigate("/scan/live")}><ScanLine className="h-5 w-5" />Scan Machine QR</Button>
          <Button variant="outline" className="h-14 justify-start gap-2" onClick={() => navigate("/preventive-maintenance")}><CalendarClock className="h-5 w-5" />PM Tasks</Button>
          <Button variant="outline" className="h-14 justify-start gap-2" onClick={() => navigate("/calibration")}><GaugeCircle className="h-5 w-5" />Calibration</Button>
          <Button variant="outline" className="h-14 justify-start gap-2" onClick={() => navigate("/amc")}><Wrench className="h-5 w-5" />AMC Visits</Button>
          <Button variant="outline" className="h-14 justify-start gap-2" onClick={() => navigate("/security-center")}><ShieldCheck className="h-5 w-5" />Safety</Button>
          <Button variant="outline" className="h-14 justify-start gap-2" onClick={() => void requestBrowserNotifications()}><Bell className="h-5 w-5" />Enable Alerts</Button>
          {installPromptEvent ? <Button variant="outline" className="h-14 justify-start gap-2" onClick={() => void installPwa()}><ShieldCheck className="h-5 w-5" />Install App</Button> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Assigned</p><p className="text-2xl font-bold">{stats.assigned}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">PM</p><p className="text-2xl font-bold">{stats.pm}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Calibration</p><p className="text-2xl font-bold">{stats.calibration}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">AMC</p><p className="text-2xl font-bold">{stats.amc}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><Bell className="h-3 w-3" />Notifications</p><p className="text-2xl font-bold">{unreadCount}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Offline Queue</p><p className="text-2xl font-bold">{queuedCount}</p></CardContent></Card>
      </div>

      <div className="sticky bottom-3 z-20 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur sm:hidden">
        <div className="grid grid-cols-4 gap-2">
          <Button size="sm" variant="ghost" className="h-11" onClick={() => navigate("/technician")}>Home</Button>
          <Button size="sm" variant="ghost" className="h-11" onClick={() => navigate("/scan/live")}>Scan</Button>
          <Button size="sm" variant="ghost" className="h-11" onClick={() => navigate("/work-orders")}>WOs</Button>
          <Button size="sm" variant="ghost" className="h-11" onClick={() => navigate("/alerts")}>Alerts</Button>
        </div>
      </div>
    </div>
  );
}
