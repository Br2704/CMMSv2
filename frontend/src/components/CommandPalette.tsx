import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NON_ROOT_APP_PAGES } from "@/config/app-page-catalog";
import { useNavigate } from "react-router-dom";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NON_ROOT_APP_PAGES.filter((p) => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.aliases || []).some(a => a.toLowerCase().includes(q))
      );
    }).slice(0, 20);
  }, [query]);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quick Navigation</DialogTitle>
          <DialogDescription className="sr-only">Search and navigate through the app.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input autoFocus placeholder="Type a page name (Ctrl/Cmd+K)" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-64 overflow-y-auto">
            {pages.map((p) => (
              <button key={p.id} onClick={() => handleSelect(p.path)} className="w-full text-left rounded-lg px-3 py-2 hover:bg-accent">
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.description}</div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CommandPalette;
