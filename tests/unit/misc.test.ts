import { describe, expect, it } from "vitest";
import { csvCell, reportToCsv } from "@/lib/csv";
import { whatsappLink } from "@/lib/whatsapp";
import { sniffMime } from "@/lib/attachments";
import { normalizePhone } from "@/domain/customers/service";
import { can, MANAGER_PERMISSIONS } from "@/lib/auth/permissions";
import { createTranslator } from "@/i18n/translate";
import fr from "@/i18n/locales/fr.json";
import type { Report } from "@/domain/reports/service";

describe("csv", () => {
  it("quotes separators and neutralises formulas", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-1250,50")).toBe("-1250,50");
  });
  it("exports a report with BOM, semicolons, decimal commas and dd/mm/yyyy dates", () => {
    const t = createTranslator(fr);
    const report: Report = {
      key: "order-value",
      usesPeriod: true,
      columns: [
        { key: "orderDate", label: "fields.date", kind: "date" },
        { key: "status", label: "fields.status", kind: "label", labelPrefix: "orderStatus." },
        { key: "dueCents", label: "money.agreed", kind: "money" },
      ],
      rows: [{ orderDate: "2026-10-05", status: "ready", dueCents: 125050 }],
      totals: { dueCents: 125050 },
    };
    expect(reportToCsv(report, t)).toBe("﻿Date;Statut;Prix convenu\r\n05/10/2026;Prête;1250,50\r\nTotal;;1250,50\r\n");
  });
});

describe("helpers", () => {
  it("builds WhatsApp click-to-chat links for Moroccan numbers", () => {
    expect(whatsappLink("06 12 34 56 78")).toBe("https://wa.me/212612345678");
    expect(whatsappLink("+212 612345678")).toBe("https://wa.me/212612345678");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
  it("normalises phones for duplicate detection", () => {
    expect(normalizePhone("+212 6 12 34 56 78")).toBe("0612345678");
    expect(normalizePhone("00212612345678")).toBe("0612345678");
    expect(normalizePhone("0612345678")).toBe("0612345678");
  });
  it("detects real file types from content", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(sniffMime(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
  it("keeps owner-only permissions away from managers", () => {
    for (const p of ["ledger.reverse", "cash.adjust", "cash.transfer", "cash.opening", "refunds.record", "users.manage", "settings.manage", "payroll.void", "audit.view"] as const) {
      expect(can("manager", p)).toBe(false);
      expect(can("owner", p)).toBe(true);
    }
    expect(MANAGER_PERMISSIONS).toContain("advances.record");
    expect(can(null, "reports.view")).toBe(false);
  });
});
