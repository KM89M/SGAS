import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { SystemSetting } from '../types/sgas';
import { INSTITUTION } from './i18n';
import { formatBaghdadDateTime } from './attendanceMath';

export function exportToExcel(
  filename: string,
  sheetName: string,
  rows: object[],
  rtl = true,
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  if (rtl) {
    wb.Workbook = { Views: [{ RTL: true }] };
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToCsv(filename: string, rows: object[]) {
  if (rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  // Prepend UTF-8 BOM so Microsoft Excel renders Arabic UTF-8 characters properly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface InstitutionalReportConfig {
  filename: string;
  titleAr: string;
  titleEn: string;
  periodLabel: string;
  appliedFilters: string;
  lang: 'ar' | 'en';
  settings: SystemSetting | null;
  summaryItems: { label: string; value: string }[];
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

/**
 * Renders an Arabic-compatible RTL/LTR institutional PDF via browser shaping engine
 * inside an isolated off-screen HTML element, avoiding broken Arabic glyph ligatures.
 */
export async function exportInstitutionalPdf(config: InstitutionalReportConfig): Promise<void> {
  const isRtl = config.lang === 'ar';
  const uniName = isRtl
    ? config.settings?.universityNameAr || INSTITUTION.universityAr
    : config.settings?.universityNameEn || INSTITUTION.universityEn;
  const colName = isRtl
    ? config.settings?.collegeNameAr || INSTITUTION.collegeAr
    : config.settings?.collegeNameEn || INSTITUTION.collegeEn;
  const deptName = isRtl
    ? config.settings?.departmentTitleAr || INSTITUTION.departmentAr
    : config.settings?.departmentTitleEn || INSTITUTION.departmentEn;
  const title = isRtl ? config.titleAr : config.titleEn;
  const generatedAt = formatBaghdadDateTime(new Date(), config.lang);

  const container = document.createElement('div');
  container.dir = isRtl ? 'rtl' : 'ltr';
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1020px';
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#1E293B';
  container.style.padding = '36px';
  container.style.fontFamily = isRtl
    ? "'Cairo', 'Tajawal', sans-serif"
    : "'Plus Jakarta Sans', sans-serif";

  const summaryHtml = config.summaryItems
    .map(
      (s) => `
      <div style="border:1px solid #DBEAFE;background:#F5F9FF;border-radius:10px;padding:10px 14px;min-width:140px;">
        <div style="font-size:11px;color:#64748B;margin-bottom:4px;">${escapeHtml(s.label)}</div>
        <div style="font-size:16px;font-weight:700;color:#1565C0;">${escapeHtml(s.value)}</div>
      </div>`,
    )
    .join('');

  const headHtml = config.columns
    .map(
      (c) =>
        `<th style="padding:10px 8px;border:1px solid #CBD5E1;background:#E3F2FD;color:#1565C0;font-size:12px;text-align:${isRtl ? 'right' : 'left'};">${escapeHtml(c.label)}</th>`,
    )
    .join('');

  const bodyHtml = config.rows
    .slice(0, 120)
    .map(
      (r, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        ${config.columns
          .map(
            (c) =>
              `<td style="padding:8px;border:1px solid #E2E8F0;font-size:11.5px;color:#1E293B;">${escapeHtml(String(r[c.key] ?? '—'))}</td>`,
          )
          .join('')}
      </tr>`,
    )
    .join('');

  container.innerHTML = `
    <div style="border-bottom:2px solid #1565C0;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
      <div>
        <div style="font-size:15px;font-weight:700;color:#1565C0;">${escapeHtml(uniName)}</div>
        <div style="font-size:14px;font-weight:600;color:#1E293B;margin-top:2px;">${escapeHtml(colName)}</div>
        <div style="font-size:12.5px;color:#475569;margin-top:2px;">${escapeHtml(deptName)}</div>
      </div>
      <div style="text-align:${isRtl ? 'left' : 'right'};font-size:11.5px;color:#475569;">
        <div><strong>${isRtl ? 'تاريخ التوليد' : 'Generated'}:</strong> ${escapeHtml(generatedAt)}</div>
        <div style="margin-top:3px;"><strong>${isRtl ? 'الفترة' : 'Period'}:</strong> ${escapeHtml(config.periodLabel)}</div>
        <div style="margin-top:3px;"><strong>${isRtl ? 'التوقيت' : 'Timezone'}:</strong> Asia/Baghdad</div>
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <h1 style="font-size:20px;font-weight:800;color:#0F172A;margin:0 0 6px 0;">${escapeHtml(title)}</h1>
      <div style="font-size:12px;color:#64748B;">${isRtl ? 'عوامل التصفية المطبقة' : 'Applied Filters'}: ${escapeHtml(config.appliedFilters)}</div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
      ${summaryHtml}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml || `<tr><td colspan="${config.columns.length}" style="padding:18px;text-align:center;color:#64748B;">${isRtl ? 'لا توجد سجلات مطابقة' : 'No matching records'}</td></tr>`}</tbody>
    </table>

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #CBD5E1;display:flex;justify-content:space-between;font-size:12px;color:#334155;">
      <div>
        <div style="font-weight:700;margin-bottom:28px;">${isRtl ? 'توقيع مسؤول شعبة الدراسات العليا' : 'Postgraduate Studies Officer Signature'}</div>
        <div style="border-top:1px dashed #94A3B8;width:200px;padding-top:4px;">${isRtl ? 'الاسم والتوقيع والختم' : 'Name, Signature & Stamp'}</div>
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:28px;">${isRtl ? 'مصادقة عمادة الكلية / القسم العلمي' : 'College / Department Approval'}</div>
        <div style="border-top:1px dashed #94A3B8;width:200px;padding-top:4px;">${isRtl ? 'التاريخ والاعتماد' : 'Date & Approval'}</div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    let pageNum = 1;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    pdf.setFontSize(9);
    pdf.text(`SGAS · ${pageNum}`, pageWidth - 24, pageHeight - 6);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pageNum += 1;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      pdf.setFontSize(9);
      pdf.text(`SGAS · ${pageNum}`, pageWidth - 24, pageHeight - 6);
      heightLeft -= pageHeight;
    }

    pdf.save(`${config.filename}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadTemplateExcel(entity: string) {
  const templates: Record<string, Record<string, unknown>[]> = {
    departments: [{ code: 'DEPT_CODE', nameAr: 'اسم القسم بالعربية', nameEn: 'Department English Name', adminName: 'اسم مسؤول القسم' }],
    programs: [{ code: 'PROG_CODE', nameAr: 'اسم البرنامج بالعربية', nameEn: 'Program English Name', degreeType: 'masters', departmentCode: 'DEPT_CODE', totalRequiredHours: 180 }],
    students: [{ universityId: 'STU-2026-001', fullNameAr: 'الاسم الكامل بالعربية', fullNameEn: 'Full English Name', email: 'student@mtu.edu.iq', phone: '07700000000', departmentCode: 'DEPT_CODE', programCode: 'PROG_CODE', enrollmentStatus: 'enrolled' }],
    lecturers: [{ lecturerCode: 'LEC-001', fullNameAr: 'اسم التدريسي بالعربية', fullNameEn: 'Lecturer English Name', academicTitleAr: 'أستاذ مساعد دكتور', email: 'lecturer@mtu.edu.iq', departmentCode: 'DEPT_CODE' }],
    subjects: [{ code: 'SUB-701', nameAr: 'اسم المادة بالعربية', nameEn: 'Subject English Name', departmentCode: 'DEPT_CODE', programCode: 'PROG_CODE', subjectType: 'mandatory', weeklyHours: 3, totalPlannedHours: 45 }],
    enrollments: [{ universityId: 'STU-2026-001', subjectCode: 'SUB-701', status: 'active' }],
    schedules: [{ subjectCode: 'SUB-701', lecturerCode: 'LEC-001', lectureDate: '2026-11-22', startTime: '09:00', endTime: '11:00', classroom: 'قاعة الدراسات 1', lectureType: 'regular' }],
  };
  const rows = templates[entity] || templates.students;
  exportToExcel(`sgas_template_${entity}`, entity, rows, true);
}
