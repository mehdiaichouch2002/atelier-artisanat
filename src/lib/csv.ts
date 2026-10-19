import type { TFunction } from "@/i18n/translate";
import type { Report, ReportColumn, ReportRow } from "@/domain/reports/service";
import { centsToCsv } from "./money";
import { formatDate, formatDateTime } from "./dates";

/** One CSV cell. Neutralises spreadsheet formula injection and quotes when needed. */
export function csvCell(v: string): string {
  let s = v;
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function cellText(col: ReportColumn, v: ReportRow[string] | undefined, t: TFunction): string {
  if (v == null || v === "") return "";
  switch (col.kind) {
    case "money":
      return centsToCsv(Number(v));
    case "date":
      return formatDate(String(v));
    case "datetime":
      return formatDateTime(v as Date | string);
    case "int":
      return String(v);
    case "label":
      return t(`${col.labelPrefix ?? ""}${String(v)}`);
    default:
      return String(v);
  }
}

/**
 * CSV for spreadsheet software used in Morocco/France: UTF-8 with BOM (accents and Arabic display
 * correctly), semicolon separators and decimal commas.
 */
export function reportToCsv(report: Report, t: TFunction): string {
  const lines = [report.columns.map((c) => csvCell(t(c.label))).join(";")];
  for (const row of report.rows) lines.push(report.columns.map((c) => csvCell(cellText(c, row[c.key], t))).join(";"));
  if (report.totals) {
    lines.push(
      report.columns
        .map((c, i) => (i === 0 ? csvCell(t("fields.total")) : report.totals![c.key] != null ? csvCell(cellText(c, report.totals![c.key]!, t)) : ""))
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
