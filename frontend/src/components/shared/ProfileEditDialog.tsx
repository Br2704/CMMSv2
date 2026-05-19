import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { FormDialog } from "./FormDialog";
import { InputField, SwitchField } from "./FormField";
import { ProfileImageField } from "./ProfileImageField";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, Bell } from "lucide-react";
import { updateProfile, changePassword, getUserNotificationSettings, updateUserNotificationSettings, type UserNotificationSettings } from "@/api/auth";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditDialog({ open, onOpenChange }: ProfileEditDialogProps) {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  const [profileData, setProfileData] = useState({
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    profileImageUrl: user?.profileImageUrl || "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [notifData, setNotifData] = useState<Partial<UserNotificationSettings>>({
    emailNotifications: true,
    pushNotifications: true,
    inAppNotifications: true,
    newWoEmail: true,
    woAssignedEmail: true,
    woEscalationEmail: true,
    slaBreachEmail: true,
    quietHoursStart: "",
    quietHoursEnd: "",
    emailDigestFrequency: "REALTIME",
  });

  useEffect(() => {
    if (open) {
      getUserNotificationSettings()
        .then((settings) => {
          setNotifData({
            emailNotifications: settings.emailNotifications ?? true,
            pushNotifications: settings.pushNotifications ?? true,
            inAppNotifications: settings.inAppNotifications ?? true,
            newWoEmail: settings.newWoEmail ?? true,
            woAssignedEmail: settings.woAssignedEmail ?? true,
            woEscalationEmail: settings.woEscalationEmail ?? true,
            slaBreachEmail: settings.slaBreachEmail ?? true,
            quietHoursStart: settings.quietHoursStart || "",
            quietHoursEnd: settings.quietHoursEnd || "",
            emailDigestFrequency: settings.emailDigestFrequency || "REALTIME",
          });
        })
        .catch((err) => {
          console.error("Failed to load user notification settings", err);
        });
    }
  }, [open]);

  const handleProfileSubmit = async () => {
    setLoading(true);
    try {
      const response = await updateProfile(profileData);
      if (response.success) {
        setUser({ ...user!, ...response.data.user, profileImageUrl: response.data.profile.profileImageUrl });
        toast.success("Profile updated successfully");
        onOpenChange(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      if (response.success) {
        toast.success("Password changed successfully");
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        onOpenChange(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleNotifSubmit = async () => {
    setLoading(true);
    try {
      await updateUserNotificationSettings({
        emailNotifications: notifData.emailNotifications,
        pushNotifications: notifData.pushNotifications,
        inAppNotifications: notifData.inAppNotifications,
        newWoEmail: notifData.newWoEmail,
        woAssignedEmail: notifData.woAssignedEmail,
        woEscalationEmail: notifData.woEscalationEmail,
        slaBreachEmail: notifData.slaBreachEmail,
        quietHoursStart: notifData.quietHoursStart || null,
        quietHoursEnd: notifData.quietHoursEnd || null,
        emailDigestFrequency: notifData.emailDigestFrequency,
      });
      toast.success("Notification settings updated successfully");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update notification settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Profile"
      description="Update your personal information and account settings."
      isLoading={loading}
      onSubmit={
        activeTab === "profile"
          ? handleProfileSubmit
          : activeTab === "password"
          ? handlePasswordSubmit
          : handleNotifSubmit
      }
      contentClassName="sm:max-w-[500px]"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-2">
            <Lock className="h-4 w-4" />
            Password
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 py-2">
          <ProfileImageField
            value={profileData.profileImageUrl}
            onChange={(val) => setProfileData((prev) => ({ ...prev, profileImageUrl: val }))}
            label="Profile Picture"
            name={user?.fullName || "User"}
            fallbackText={user?.fullName || "U"}
          />
          <InputField
            label="Full Name"
            value={profileData.fullName}
            onChange={(val) => setProfileData((prev) => ({ ...prev, fullName: val }))}
            required
          />
          <InputField
            label="Phone"
            value={profileData.phone}
            onChange={(val) => setProfileData((prev) => ({ ...prev, phone: val }))}
          />
        </TabsContent>

        <TabsContent value="password" className="space-y-4 py-2">
          <InputField
            label="Current Password"
            type="password"
            value={passwordData.currentPassword}
            onChange={(val) => setPasswordData((prev) => ({ ...prev, currentPassword: val }))}
            required
          />
          <InputField
            label="New Password"
            type="password"
            value={passwordData.newPassword}
            onChange={(val) => setPasswordData((prev) => ({ ...prev, newPassword: val }))}
            required
          />
          <InputField
            label="Confirm New Password"
            type="password"
            value={passwordData.confirmPassword}
            onChange={(val) => setPasswordData((prev) => ({ ...prev, confirmPassword: val }))}
            required
          />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 py-2 max-h-[380px] overflow-y-auto pr-2">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Channels</h4>
            <SwitchField
              label="In-App Notifications"
              checked={notifData.inAppNotifications ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, inAppNotifications: val }))}
              description="Receive notifications in the in-app notification bell."
            />
            <SwitchField
              label="Email Notifications"
              checked={notifData.emailNotifications ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, emailNotifications: val }))}
              description="Receive transaction alerts via your registered email."
            />
            <SwitchField
              label="Push Notifications"
              checked={notifData.pushNotifications ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, pushNotifications: val }))}
              description="Receive real-time push alerts on your desktop or mobile device."
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Preferences</h4>
            <SwitchField
              label="New Work Order Raised"
              checked={notifData.newWoEmail ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, newWoEmail: val }))}
              description="Receive notification when a new work order is raised."
            />
            <SwitchField
              label="Work Order Assignment"
              checked={notifData.woAssignedEmail ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, woAssignedEmail: val }))}
              description="Receive notification when a work order is assigned to you."
            />
            <SwitchField
              label="Work Order Escalation"
              checked={notifData.woEscalationEmail ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, woEscalationEmail: val }))}
              description="Receive notification on unassigned or delayed work order escalations."
            />
            <SwitchField
              label="SLA Breach Alerts"
              checked={notifData.slaBreachEmail ?? true}
              onChange={(val) => setNotifData((prev) => ({ ...prev, slaBreachEmail: val }))}
              description="Receive alerts when a work order is close to breaching SLA targets."
            />
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Quiet Hours</h4>
            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Quiet Hours Start"
                type="time"
                value={notifData.quietHoursStart || ""}
                onChange={(val) => setNotifData((prev) => ({ ...prev, quietHoursStart: val }))}
                hint="Mute alerts starting from"
              />
              <InputField
                label="Quiet Hours End"
                type="time"
                value={notifData.quietHoursEnd || ""}
                onChange={(val) => setNotifData((prev) => ({ ...prev, quietHoursEnd: val }))}
                hint="Unmute alerts starting from"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </FormDialog>
  );
}
