import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { FormDialog } from "./FormDialog";
import { InputField } from "./FormField";
import { ProfileImageField } from "./ProfileImageField";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock } from "lucide-react";
import { updateProfile, changePassword } from "@/api/auth";

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

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Profile"
      description="Update your personal information and account security settings."
      loading={loading}
      onSubmit={activeTab === "profile" ? handleProfileSubmit : handlePasswordSubmit}
      contentClassName="sm:max-w-[500px]"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-2">
            <Lock className="h-4 w-4" />
            Password
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
      </Tabs>
    </FormDialog>
  );
}
