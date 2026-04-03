import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { Phase1PDF } from "@/components/Phase1ReportPDF";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studyId: string }> }
) {
  const { studyId } = await params;

  const supabase = await createClient();

  // Load study
  const { data: study, error: studyErr } = await supabase
    .from("studies")
    .select("name, indication, phase1_run_id")
    .eq("id", studyId)
    .single();

  if (studyErr || !study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  if (!study.phase1_run_id) {
    return NextResponse.json({ error: "No Phase 1 report available" }, { status: 404 });
  }

  // Load report data
  const { data: reportRow, error: reportErr } = await supabase
    .from("phase1_reports")
    .select("report_data, created_at")
    .eq("run_id", study.phase1_run_id)
    .single();

  if (reportErr || !reportRow) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Render PDF server-side — no Turbopack bundling involved
  const buffer = await renderToBuffer(
    React.createElement(Phase1PDF, {
      report: reportRow.report_data,
      drugName: study.name,
      indication: study.indication ?? "",
      generatedAt: reportRow.created_at,
    })
  );

  const filename = `${study.name.replace(/[^a-z0-9]/gi, "-")}-Phase1-Preclinical-Report.pdf`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
