import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Factory } from "lucide-react";
import { isRootAdmin, isSuperAdmin, useAuthStore } from "@/store/auth.store";
import { SidebarToggle } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, LogOut, Search, AlertCircle, CheckCircle, Info, Clock, CheckCheck, Mail, Phone, Shield, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import { useBrandingStore } from "@/store/branding.store";
import { formatDistanceToNow } from "date-fns";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { toast } from "sonner";

interface TopbarProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function Topbar({ onMenuClick, sidebarCollapsed }: TopbarProps) {
  const { user, logout, activePlantCode, activePlantName } = useAuthStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const isRootUser = isRootAdmin(user);
  const brandingOrganizationName = useBrandingStore((state) => state.organizationName);
  const organizationName = user?.organizationName || brandingOrganizationName || null;
  const { hasModuleAccess } = usePermissions();
  const canReadNotifications = isRootUser || hasModuleAccess("alerts", "view") || hasModuleAccess("notifications", "view");
  const { notifications, unreadCount, loading: notificationsLoading, markAsRead, markAllAsRead, removeNotification } = useNotifications({ enabled: canReadNotifications });
  const navigate = useNavigate();
  const showOrganizationBadge = isSuperAdmin(user) && !activePlantCode && Boolean(organizationName);
  const badgeTitle = showOrganizationBadge ? organizationName : activePlantCode;
  const badgeSubtitle = showOrganizationBadge ? null : activePlantName;
  const notificationsSubtitle =
    notifications.length === 0 ? "No updates right now" : `${unreadCount} unread of ${notifications.length}`;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role.includes("ADMIN")) return "primary" as const;
    if (role.includes("INCHARGE")) return "info" as const;
    return "default" as const;
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "critical": return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning": return <Clock className="h-4 w-4 text-amber-500" />;
      case "success": return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const handleNotifClick = async (notif: { id: string; is_read: boolean; link?: string | null }) => {
    try {
      if (!notif.is_read) {
        await markAsRead(notif.id);
      }
      setIsNotificationsOpen(false);
      if (notif.link) navigate(notif.link);
    } catch {
      toast.error("Failed to open notification");
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id);
    } catch {
      toast.error("Failed to mark notification as read");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch {
      toast.error("Failed to mark all notifications as read");
    }
  };

  const handleRemoveNotification = async (id: string) => {
    try {
      await removeNotification(id);
    } catch {
      toast.error("Failed to remove notification");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center gap-2 sm:gap-4 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-3 sm:px-4 lg:px-6 safe-area-inset">
      <SidebarToggle onClick={onMenuClick} label="Toggle sidebar" collapsed={sidebarCollapsed} />

      {/* Active Plant Badge */}
      {badgeTitle && (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
          <Factory className="h-4 w-4 text-primary" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-primary leading-none">{badgeTitle}</span>
            {badgeSubtitle ? (
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{badgeSubtitle}</span>
            ) : null}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative hidden sm:flex flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search work orders, assets..."
          className="h-10 w-full pl-9 bg-muted/50 border-0 focus-visible:ring-1"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Notifications Dialog */}
        {canReadNotifications && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-11 w-11"
              aria-label="Open notifications"
              onClick={() => setIsNotificationsOpen(true)}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            <ViewDialog
              open={isNotificationsOpen}
              onOpenChange={setIsNotificationsOpen}
              title="Notifications"
              subtitle={notificationsSubtitle}
              contentClassName="sm:max-w-[720px]"
            >
              <div className="space-y-4">
                {unreadCount > 0 ? (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={handleMarkAllAsRead}>
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all as read
                    </Button>
                  </div>
                ) : null}

                <ScrollArea className="h-[420px] rounded-lg border border-border/60">
                  {notificationsLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                      <Bell className="mb-2 h-8 w-8 opacity-30" />
                      <p className="text-sm">Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                      <Bell className="mb-2 h-8 w-8 opacity-30" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`border-b border-border/50 px-4 py-4 last:border-b-0 ${!notif.is_read ? "bg-primary/5" : "bg-background"}`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => void handleNotifClick(notif)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">{getNotifIcon(notif.type)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`line-clamp-1 text-sm font-medium ${!notif.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                                  {notif.title}
                                </span>
                                {!notif.is_read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notif.message}</p>
                              <p className="mt-2 text-[11px] text-muted-foreground/70">
                                {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </button>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          {!notif.is_read ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => void handleMarkAsRead(notif.id)}
                            >
                              Mark as read
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => void handleRemoveNotification(notif.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>
            </ViewDialog>
          </>
        )}

        <Button variant="ghost" className="min-h-11 gap-3 px-2.5 hover:bg-accent" onClick={() => setIsProfileOpen(true)}>
          <Avatar className="h-8 w-8 border-2 border-primary/20">
            {user?.profileImageUrl ? <AvatarImage src={user.profileImageUrl} alt={user.fullName} className="object-cover" /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {user ? getInitials(user.fullName) : "U"}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start md:flex">
            <span className="text-sm font-medium">{user?.fullName}</span>
            <span className="text-xs text-muted-foreground">
              {user?.roles?.[0]?.replace(/_/g, " ") || "User"}
            </span>
          </div>
        </Button>
      </div>

      <ViewDialog
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        title={user?.fullName || "User Profile"}
        subtitle={user?.userCode || user?.email}
      >
        {user ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b pb-4">
              <Avatar className="h-20 w-20 border border-border/70">
                {user.profileImageUrl ? <AvatarImage src={user.profileImageUrl} alt={user.fullName} className="object-cover" /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                  {getInitials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <div>
                  <p className="text-lg font-semibold">{user.fullName}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <StatusBadge key={role} variant={getRoleBadgeVariant(role)} showDot={false}>
                      {role.replace(/_/g, " ")}
                    </StatusBadge>
                  ))}
                </div>
              </div>
            </div>

            <DetailSection title="Account Details">
              <DetailRow label="User Code" value={user.userCode} />
              <DetailRow label="Email" value={<span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{user.email}</span>} />
              <DetailRow label="Phone" value={user.phone ? <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{user.phone}</span> : "-"} />
              <DetailRow label="Department" value={user.department || "-"} />
            </DetailSection>

            <DetailSection title="Scope & Access">
              <DetailRow label="Scope" value={user.scopeType?.replace(/_/g, " ") || "-"} />
              <DetailRow label="Organization" value={organizationName || "-"} />
              <DetailRow label="Plant" value={activePlantName || activePlantCode || "-"} />
              <DetailRow label="Status" value={<span className="inline-flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" />{user.isActive ? "Active" : "Inactive"}</span>} />
            </DetailSection>

            <div className="flex justify-end">
              <Button variant="destructive" className="gap-2" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        ) : null}
      </ViewDialog>
    </header>
  );
}
