import { Injectable } from "@nestjs/common";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { ReportFormat } from "./dto/export-query.dto";

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
}

// Every report handed to this service must already be a flat row array of
// primitive values (docs/MODULES-SPEC.md Phase 14: "تصدير PDF/Excel هو طبقة
// عرض فقط فوق نفس الاستعلامات") - this is the single place PDF/Excel
// rendering happens so no report needs its own bespoke layout code.
export type ReportRow = Record<string, string | number | boolean | null>;

@Injectable()
export class ReportExportService {
  async toPdf(title: string, columns: ReportColumn[], rows: ReportRow[]): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(16).text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#666666").text(new Date().toISOString(), { align: "center" });
    doc.moveDown(1);
    doc.fillColor("#000000");

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalWeight = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
    const colWidths = columns.map((c) => (pageWidth * (c.width ?? 1)) / totalWeight);
    const rowHeight = 20;

    const drawRow = (values: string[], y: number, isHeader: boolean) => {
      let x = doc.page.margins.left;
      doc.fontSize(9).font(isHeader ? "Helvetica-Bold" : "Helvetica");
      values.forEach((value, i) => {
        doc.text(value, x, y, { width: colWidths[i], ellipsis: true });
        x += colWidths[i];
      });
    };

    const ensureSpace = (y: number): number => {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        return doc.page.margins.top;
      }
      return y;
    };

    let y = doc.y;
    drawRow(columns.map((c) => c.header), y, true);
    y += rowHeight;
    doc
      .moveTo(doc.page.margins.left, y - 4)
      .lineTo(doc.page.width - doc.page.margins.right, y - 4)
      .strokeColor("#cccccc")
      .stroke();

    if (rows.length === 0) {
      doc.fontSize(9).font("Helvetica").fillColor("#888888").text("لا توجد بيانات", doc.page.margins.left, y);
    }

    for (const row of rows) {
      y = ensureSpace(y);
      const values = columns.map((c) => this.formatCell(row[c.key]));
      drawRow(values, y, false);
      y += rowHeight;
    }

    doc.end();
    return done;
  }

  async toExcel(title: string, columns: ReportColumn[], rows: ReportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 31) || "Report");
    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: (c.width ?? 1) * 15 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(row);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private formatCell(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  // Every report controller ends its handler with this one call - json when
  // no format is requested (the plain, richly-shaped API response), or a
  // downloadable PDF/Excel built from the SAME flat rows otherwise
  // (docs/MODULES-SPEC.md Phase 14: export is a presentation layer only over
  // the same query, never a separate code path that could drift).
  async respond(
    res: Response,
    format: ReportFormat | undefined,
    filename: string,
    title: string,
    columns: ReportColumn[],
    rows: ReportRow[],
    jsonData: unknown,
  ): Promise<void> {
    if (!format) {
      res.json(jsonData);
      return;
    }
    if (format === "pdf") {
      const buffer = await this.toPdf(title, columns, rows);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      });
      res.send(buffer);
      return;
    }
    const buffer = await this.toExcel(title, columns, rows);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    });
    res.send(buffer);
  }
}
