"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button size="compact" variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer size={15} aria-hidden="true" />
      Print
    </Button>
  );
}
