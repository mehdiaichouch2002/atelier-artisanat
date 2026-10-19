import type { TFunction } from "@/i18n/translate";
import type { Report, ReportColumn, ReportRow } from "@/domain/reports/service";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Money } from "./ui/money";
import { EmptyState } from "./ui/card";
import { Table, Td, Th } from "./table";

function Cell({ col, v, t }: { col: ReportColumn; v: ReportRow[string] | undefined; t: TFunction }) {
  if (v == null || v === "") return <>—</>;
  switch (col.kind) {
    case "money":
      return <Money cents={Number(v)} tone={Number(v) < 0 ? "auto" : undefined} />;
    case "date":
      return <span className="num">{formatDate(String(v))}</span>;
    case "datetime":
      return <span className="num">{formatDateTime(v as Date)}</span>;
    case "int":
      return <span className="num">{String(v)}</span>;
    case "label":
      return <>{t(`${col.labelPrefix ?? ""}${String(v)}`)}</>;
    default:
      return <>{String(v)}</>;
  }
}

export function ReportTable({ report, t }: { report: Report; t: TFunction }) {
  if (report.rows.length === 0) return <EmptyState title={t("reports.noData")} />;
  const numeric = (c: ReportColumn) => c.kind === "money" || c.kind === "int";
  return (
    <Table caption={t(`reports.list.${report.key}.title`)}>
      <thead>
        <tr>
          {report.columns.map((c) => (
            <Th key={c.key} num={numeric(c)}>{t(c.label)}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((row, i) => (
          <tr key={i}>
            {report.columns.map((c, j) => (
              <Td key={c.key} label={t(c.label)} num={numeric(c)} primary={j === 0}>
                <Cell col={c} v={row[c.key]} t={t} />
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
      {report.totals ? (
        <tfoot>
          <tr>
            {report.columns.map((c, j) => (
              <Td key={c.key} label={j === 0 ? "" : t(c.label)} num={numeric(c)}>
                {j === 0 ? t("fields.total") : report.totals![c.key] != null ? <Cell col={c} v={report.totals![c.key]!} t={t} /> : ""}
              </Td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </Table>
  );
}
