import React, { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";
import { Download, Loader2, Wrench, AlertTriangle, CheckCircle, Package, History, Search, Banknote, Clock, Paperclip, ClipboardList, Info } from "lucide-react";
import { listWorkOrders } from "@/api/workorders";
import { toast } from "sonner";
import { downloadAssetLogbook } from "@/api/assets";

interface AssetLogbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetCode: string;
  assetName: string;
}

const parseAttachments = (raw: any) => {
  if (!raw) return [];
  try {
    if (typeof raw === "string") return JSON.parse(raw);
    if (Array.isArray(raw)) return raw;
  } catch {
    return [];
  }
  return [];
};

export function AssetLogbookDialog({ open, onOpenChange, assetId, assetCode, assetName }: AssetLogbookDialogProps) {
  const [loading, setLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open || !assetId) return;
    
    let isMounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await listWorkOrders({ limit: 1000 });
        if (isMounted) {
          // Filter strictly by this asset's ID
          const assetWorkOrders = (res.data || []).filter((wo: any) => String(wo.asset_id) === String(assetId) || String(wo.assetId) === String(assetId));
          // Sort by created_at descending
          const sorted = assetWorkOrders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setWorkOrders(sorted);
        }
      } catch (err) {
        if (isMounted) toast.error("Failed to load work order history");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchHistory();
    
    return () => {
      isMounted = false;
      setSearchQuery("");
    };
  }, [open, assetId]);

  const handleDownload = async () => {
    toast.promise(downloadAssetLogbook(assetId, assetCode), {
      loading: "Generating PDF logbook...",
      success: "Logbook downloaded successfully",
      error: "Failed to download logbook",
    });
  };

  const getStatusColor = (status: string) => {
    if (status === "CLOSED" || status === "COMPLETED") return "active";
    if (status === "RAISED") return "warning";
    if (status === "REJECTED") return "destructive";
    return "info";
  };

  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      
      const techVerif = typeof wo.technician_verification === "string" 
        ? JSON.parse(wo.technician_verification || "{}") 
        : (wo.technician_verification || {});

      return (
        (wo.wo_number || "").toLowerCase().includes(query) ||
        (wo.problem_description || "").toLowerCase().includes(query) ||
        (wo.root_cause || "").toLowerCase().includes(query) ||
        (wo.action_taken || "").toLowerCase().includes(query) ||
        (wo.parts_replaced || "").toLowerCase().includes(query) ||
        (wo.failure_code || "").toLowerCase().includes(query) ||
        (techVerif.initial_assessment || "").toLowerCase().includes(query)
      );
    });
  }, [workOrders, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none sm:!max-w-none !w-screen sm:!w-screen h-[100dvh] !max-h-[100dvh] !rounded-none overflow-hidden flex flex-col p-0 gap-0 bg-slate-50 border-none !m-0 !top-0 !left-0 !translate-x-0 !translate-y-0">
        <DialogHeader className="p-6 bg-white border-b border-slate-200/50 flex-none relative z-10 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                  <History className="h-5 w-5" />
                </div>
                Machine Logbook
              </DialogTitle>
              <DialogDescription className="text-sm font-bold text-slate-500 mt-2 ml-[52px]">
                {assetCode} • {assetName}
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-3 ml-[52px] md:ml-0">
              <Button variant="outline" size="sm" className="gap-2 shadow-sm rounded-xl h-9 hover:bg-slate-50 transition-all border-slate-200" onClick={handleDownload}>
                <Download className="h-4 w-4 text-primary" />
                Download PDF
              </Button>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search symptoms, fixes, parts..."
                  className="pl-9 h-9 text-xs bg-slate-50/50 border-slate-200/60 focus-visible:ring-primary/20 rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/40" />
              <p className="text-sm font-bold uppercase tracking-widest">Loading Records...</p>
            </div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
              {searchQuery ? (
                <>
                  <Search className="h-12 w-12 mb-4 text-slate-200" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-500">No Matches Found</p>
                  <p className="text-xs font-medium mt-1">Try adjusting your search terms.</p>
                </>
              ) : (
                <>
                  <CheckCircle className="h-12 w-12 mb-4 text-emerald-400/50" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-500">Operational Log Stable</p>
                  <p className="text-xs font-medium mt-1">No historical maintenance records found for this machine.</p>
                </>
              )}
            </div>
          ) : (
            <div className="relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px lg:before:mx-auto lg:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent">
              {filteredWorkOrders.map((wo, i) => {
                const techVerif = typeof wo.technician_verification === "string" 
                  ? JSON.parse(wo.technician_verification || "{}") 
                  : (wo.technician_verification || {});
                
                const allAttachments = [
                  ...parseAttachments(wo.attachments),
                  ...parseAttachments(techVerif.attachments)
                ];

                return (
                  <div key={wo.id} className="relative flex items-center justify-between lg:justify-normal lg:odd:flex-row-reverse group is-active mb-8 last:mb-0">
                    
                    {/* Timeline dot */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-50 bg-white shadow-sm shrink-0 lg:order-1 lg:group-odd:-translate-x-1/2 lg:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110 group-hover:border-primary/20">
                      <Wrench className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                    </div>
                    
                    {/* Content Box */}
                    <div className="w-[calc(100%-4rem)] lg:w-[calc(50%-2.5rem)] bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:border-primary/30 transition-all hover:shadow-industrial-sm group-hover:-translate-y-0.5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-1 block">
                            {wo.created_at ? format(new Date(wo.created_at), "MMM dd, yyyy") : "Unknown Date"}
                          </span>
                          <h4 className="text-sm font-black text-slate-900 tracking-tight">{wo.wo_number || "Work Order"}</h4>
                        </div>
                        <StatusBadge variant={getStatusColor(wo.status)} className="text-[9px] px-2.5 h-6 shadow-sm">
                          {(wo.status || "UNKNOWN").replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                      
                      <div className="space-y-4">
                        {/* Problem */}
                        <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100 shadow-inner">
                          <div className="flex items-center gap-1.5 mb-1.5 text-slate-500">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Problem Reported</span>
                          </div>
                          <p className="text-xs font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {wo.problem_description || "Routine check or unspecified issue."}
                          </p>
                        </div>

                        {/* Assessment / Failure Code */}
                        {(techVerif.initial_assessment || wo.failure_code) && (
                          <div className="bg-amber-50/40 rounded-2xl p-3.5 border border-amber-100/50">
                            <div className="flex items-center gap-1.5 mb-2 text-amber-600">
                              <ClipboardList className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Assessment & Diagnostics</span>
                            </div>
                            {wo.failure_code && (
                              <div className="mb-2">
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Failure Code</span>
                                <StatusBadge variant="warning" className="text-[9px] h-5">{wo.failure_code}</StatusBadge>
                              </div>
                            )}
                            {techVerif.initial_assessment && (
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Technician Findings</span>
                                <p className="text-xs font-medium text-slate-700">{techVerif.initial_assessment}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Resolution/Action */}
                        {(wo.action_taken || wo.root_cause) && (
                          <div className="bg-emerald-50/40 rounded-2xl p-3.5 border border-emerald-100/50">
                            <div className="flex items-center gap-1.5 mb-2 text-emerald-600">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Fixing Details & Action Taken</span>
                            </div>
                            
                            {wo.root_cause && (
                              <div className="mb-2.5">
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Root Cause</span>
                                <p className="text-xs font-bold text-slate-800">{wo.root_cause}</p>
                              </div>
                            )}
                            
                            {wo.action_taken && (
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Action Taken</span>
                                <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{wo.action_taken}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Parts Replaced */}
                        {wo.parts_replaced && (
                          <div className="flex items-start gap-2.5 bg-blue-50/40 rounded-2xl p-3.5 border border-blue-100/50">
                            <Package className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Parts Replaced</span>
                              <p className="text-xs font-bold text-slate-700 leading-relaxed">{wo.parts_replaced}</p>
                            </div>
                          </div>
                        )}

                        {/* Attachments Gallery */}
                        {allAttachments.length > 0 && (
                          <div className="pt-2">
                             <div className="flex items-center gap-1.5 mb-2 text-slate-400">
                              <Paperclip className="h-3 w-3" />
                              <span className="text-[9px] font-black uppercase tracking-widest">Attached Media</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {allAttachments.map((file: any, idx: number) => (
                                <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="relative h-14 w-14 rounded-xl border border-slate-200 overflow-hidden group shadow-sm bg-slate-100 block">
                                  <img src={file.url} alt="Attachment" className="absolute inset-0 h-full w-full object-cover group-hover:scale-110 transition-transform duration-300" />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer Metadata */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 border-t border-slate-100 mt-4">
                          {wo.closed_at && (
                            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Closed</span>
                              <span className="text-[10px] font-bold text-slate-700">{format(new Date(wo.closed_at), "MMM dd, HH:mm")}</span>
                            </div>
                          )}
                          {wo.downtime_minutes > 0 && (
                            <div className="flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                              <Clock className="h-3 w-3 text-rose-500" />
                              <span className="text-[10px] font-black text-rose-700">{wo.downtime_minutes}m downtime</span>
                            </div>
                          )}
                          {Number(wo.actual_cost || 0) > 0 && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                              <Banknote className="h-3 w-3 text-emerald-500" />
                              <span className="text-[10px] font-black text-emerald-700">₹{wo.actual_cost}</span>
                            </div>
                          )}
                          {Number(wo.labor_hours || 0) > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                              <Wrench className="h-3 w-3 text-amber-500" />
                              <span className="text-[10px] font-black text-amber-700">{Number(wo.labor_hours).toFixed(1)}h labor</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
