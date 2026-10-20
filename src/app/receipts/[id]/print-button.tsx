"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// On phones, printing also offers "Save as PDF".
export function PrintButton({ className }: { className?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className={className}>
      <Printer aria-hidden className="size-5" />
      Print or save as PDF
    </Button>
  );
}
