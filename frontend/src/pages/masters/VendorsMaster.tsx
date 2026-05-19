import { useEffect, useMemo, useState } from "react";
import { useAuthStore, isAdmin } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Truck, Phone, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, TextareaField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { createVendor, deleteVendor, listVendors, type Vendor, updateVendor } from "@/api/vendors";

interface VendorFormState {
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  gstNumber: string;
  category: string;
  isActive: boolean;
}

const emptyForm: VendorFormState = {
  code: "",
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  gstNumber: "",
  category: "",
  isActive: true,
};

export default function VendorsMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState<VendorFormState>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const response = await listVendors({ page: 1, limit: 1000, search: searchQuery || undefined });
      setVendors(response.data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [searchQuery]);

  const filtered = useMemo(() => vendors, [vendors]);

  const handleAdd = () => {
    setFormData(emptyForm);
    setSelectedVendor(null);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = (vendor: Vendor) => {
    setFormData({
      code: vendor.code,
      name: vendor.name,
      contactPerson: vendor.contactPerson || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      gstNumber: vendor.gstNumber || "",
      category: vendor.category || "",
      isActive: vendor.isActive,
    });
    setSelectedVendor(vendor);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and name are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        contactPerson: formData.contactPerson.trim() || null,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        gstNumber: formData.gstNumber.trim() || null,
        category: formData.category || null,
        isActive: formData.isActive,
      };
      if (isEditing && selectedVendor) {
        await updateVendor(selectedVendor.id, payload);
        toast.success("Vendor updated");
      } else {
        await createVendor(payload);
        toast.success("Vendor created");
      }
      setIsFormOpen(false);
      await fetchVendors();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedVendor) return;
    setSaving(true);
    try {
      await deleteVendor(selectedVendor.id);
      toast.success("Vendor deleted");
      setIsDeleteOpen(false);
      await fetchVendors();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete vendor");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "code", header: "Code", render: (item: Vendor) => <span className="font-semibold text-primary">{item.code}</span> },
    { key: "name", header: "Name", render: (item: Vendor) => <span className="font-medium">{item.name}</span> },
    { key: "category", header: "Category", render: (item: Vendor) => item.category ? <StatusBadge variant="info" showDot={false}>{item.category}</StatusBadge> : "-", hideOnMobile: true },
    { key: "contact", header: "Contact", render: (item: Vendor) => item.contactPerson || "-", hideOnMobile: true },
    { key: "phone", header: "Phone", render: (item: Vendor) => item.phone ? <span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3" />{item.phone}</span> : "-", hideOnMobile: true },
    { key: "status", header: "Status", render: (item: Vendor) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: Vendor) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedVendor(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedVendor(item); setIsDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <BackButton />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight lg:text-3xl">Vendor Master</h1>
          <p className="text-sm text-muted-foreground">Manage vendors and suppliers</p>
        </div>
        {canManage && (
          <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        )}
      </div>
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Vendors ({filtered.length})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search vendors..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No vendors found.</div>
          ) : (
            <ResponsiveTable
              data={filtered}
              columns={columns}
              keyExtractor={(item: Vendor) => item.id}
              mobileCard={(item: Vendor) => (
                <MobileCard onView={() => { setSelectedVendor(item); setIsViewOpen(true); }} onEdit={canManage ? () => handleEdit(item) : undefined} onDelete={canManage ? () => { setSelectedVendor(item); setIsDeleteOpen(true); } : undefined}>
                  <MobileCardHeader title={item.code} subtitle={item.name} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} />
                  <MobileCardRow label="Category" value={item.category || "-"} />
                  <MobileCardRow label="Contact" value={item.contactPerson || "-"} />
                </MobileCard>
              )}
            />
          )}
        </CardContent>
      </Card>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={isEditing ? "Edit Vendor" : "Add New Vendor"} description={isEditing ? "Update vendor" : "Add a new vendor"} onSubmit={handleSubmit} submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add Vendor"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Code" value={formData.code} onChange={(value) => setFormData({ ...formData, code: value })} placeholder="VND-001" required />
          <InputField label="Name" value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} placeholder="SKF Bearings" required />
          <InputField label="Category" value={formData.category} onChange={(value) => setFormData({ ...formData, category: value })} placeholder="Bearings" />
          <InputField label="Contact Person" value={formData.contactPerson} onChange={(value) => setFormData({ ...formData, contactPerson: value })} placeholder="Name" />
          <InputField label="Phone" value={formData.phone} onChange={(value) => setFormData({ ...formData, phone: value })} placeholder="+91..." type="tel" />
          <InputField label="Email" value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} type="email" />
          <InputField label="GST Number" value={formData.gstNumber} onChange={(value) => setFormData({ ...formData, gstNumber: value })} />
          <TextareaField label="Address" value={formData.address} onChange={(value) => setFormData({ ...formData, address: value })} className="sm:col-span-2" />
        </div>
      </FormDialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedVendor?.name || ""} subtitle={selectedVendor?.code}>
        {selectedVendor && (
          <div className="space-y-6">
            <DetailSection title="Basic">
              <DetailRow label="Code" value={selectedVendor.code} />
              <DetailRow label="Name" value={selectedVendor.name} />
              <DetailRow label="Category" value={selectedVendor.category || "-"} />
            </DetailSection>
            <DetailSection title="Contact">
              <DetailRow label="Contact" value={selectedVendor.contactPerson || "-"} />
              <DetailRow label="Phone" value={selectedVendor.phone || "-"} />
              <DetailRow label="Email" value={selectedVendor.email || "-"} />
              <DetailRow label="Address" value={selectedVendor.address || "-"} />
            </DetailSection>
            <DetailSection title="Tax">
              <DetailRow label="GST" value={selectedVendor.gstNumber || "-"} />
            </DetailSection>
          </div>
        )}
      </ViewDialog>
      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Vendor" itemName={selectedVendor?.name} onConfirm={confirmDelete} isLoading={saving} />
    </div>
  );
}
