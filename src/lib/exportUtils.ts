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
  orientation?: 'portrait' | 'landscape';
  documentRef?: string;
  officialNotes?: string;
  generatedBy?: string;
  includeSignatures?: boolean;
}

export function paginateReportRows<T>(rows: T[], firstPageSize: number, nextPageSize: number): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  pages.push(rows.slice(0, firstPageSize));
  let offset = firstPageSize;
  while (offset < rows.length) {
    pages.push(rows.slice(offset, offset + nextPageSize));
    offset += nextPageSize;
  }
  return pages;
}

export function buildOfficialDocumentRef(reportType: string, dateStr: string): string {
  const cleanType = reportType.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'RPT';
  const cleanDate = dateStr.replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MTU-TCM-${cleanType}-${cleanDate}-${suffix}`;
}

export function buildOfficialReportHtmlPage(
  config: InstitutionalReportConfig,
  pageRows: Record<string, unknown>[],
  pageIndex: number,
  totalPages: number,
  rowStartOffset: number,
): string {
  const isRtl = config.lang === 'ar';
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === totalPages - 1;

  const uniName = isRtl
    ? config.settings?.universityNameAr || INSTITUTION.universityAr
    : config.settings?.universityNameEn || INSTITUTION.universityEn;
  const colName = isRtl
    ? config.settings?.collegeNameAr || INSTITUTION.collegeAr
    : config.settings?.collegeNameEn || INSTITUTION.collegeEn;
  const deptName = isRtl
    ? config.settings?.departmentTitleAr || INSTITUTION.departmentAr
    : config.settings?.departmentTitleEn || INSTITUTION.departmentEn;
  const ministryLabel = isRtl
    ? 'جمهورية العراق · وزارة التعليم العالي والبحث العلمي'
    : 'Republic of Iraq · Ministry of Higher Education & Scientific Research';

  const title = isRtl ? config.titleAr : config.titleEn;
  const generatedAt = formatBaghdadDateTime(new Date(), config.lang);
  const docRef = config.documentRef || `MTU-TCM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const uniLogo = config.settings?.universityLogoUrl
    ? `<img src="${escapeHtml(config.settings.universityLogoUrl)}" crossorigin="anonymous" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid #DBEAFE;background:#FFFFFF;" onerror="this.style.display='none'" />`
    : `<div style="width:54px;height:54px;border-radius:10px;background:#1565C0;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;">MTU</div>`;

  const colLogo = config.settings?.collegeLogoUrl
    ? `<img src="${escapeHtml(config.settings.collegeLogoUrl)}" crossorigin="anonymous" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid #DBEAFE;background:#FFFFFF;" onerror="this.style.display='none'" />`
    : '';

  const summaryHtml = config.summaryItems
    .map(
      (s) => `
      <div style="flex:1;min-width:130px;border:1px solid #BFDBFE;background:#F5F9FF;border-radius:8px;padding:9px 12px;">
        <div style="font-size:10.5px;color:#475569;margin-bottom:3px;">${escapeHtml(s.label)}</div>
        <div style="font-size:15px;font-weight:800;color:#1565C0;">${escapeHtml(s.value)}</div>
      </div>`,
    )
    .join('');

  const headHtml = `
    <th style="padding:8px 6px;border:1px solid #CBD5E1;background:#E3F2FD;color:#1565C0;font-size:11px;text-align:center;width:34px;">#</th>
    ${config.columns
      .map(
        (c) =>
          `<th style="padding:8px 7px;border:1px solid #CBD5E1;background:#E3F2FD;color:#1565C0;font-size:11px;text-align:${isRtl ? 'right' : 'left'};font-weight:700;">${escapeHtml(c.label)}</th>`,
      )
      .join('')}
  `;

  const bodyHtml = pageRows
    .map(
      (r, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding:7px 6px;border:1px solid #E2E8F0;font-size:10.5px;color:#64748B;text-align:center;font-family:'IBM Plex Mono',monospace;">${rowStartOffset + idx + 1}</td>
        ${config.columns
          .map(
            (c) =>
              `<td style="padding:7px 7px;border:1px solid #E2E8F0;font-size:11px;color:#0F172A;">${escapeHtml(String(r[c.key] ?? '—'))}</td>`,
          )
          .join('')}
      </tr>`,
    )
    .join('');

  return `
    <div style="direction:${isRtl ? 'rtl' : 'ltr'};font-family:${isRtl ? "'Cairo', 'Tajawal', sans-serif" : "'Plus Jakarta Sans', sans-serif"};color:#0F172A;background:#FFFFFF;padding:28px 32px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;min-height:100%;">
      <div>
        <!-- Official Letterhead -->
        <div style="border-bottom:2px solid #1565C0;padding-bottom:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${uniLogo}
            <div>
              <div style="font-size:11px;color:#475569;font-weight:600;">${escapeHtml(ministryLabel)}</div>
              <div style="font-size:15px;font-weight:800;color:#1565C0;margin-top:2px;">${escapeHtml(uniName)}</div>
              <div style="font-size:13px;font-weight:700;color:#1E293B;">${escapeHtml(colName)} · ${escapeHtml(deptName)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="text-align:${isRtl ? 'left' : 'right'};font-size:10.5px;color:#334155;line-height:1.55;">
              <div><strong>${isRtl ? 'رقم الوثيقة' : 'Doc Ref'}:</strong> <span style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(docRef)}</span></div>
              <div><strong>${isRtl ? 'تاريخ الإصدار' : 'Issued'}:</strong> ${escapeHtml(generatedAt)}</div>
              <div><strong>${isRtl ? 'الفترة' : 'Period'}:</strong> ${escapeHtml(config.periodLabel)}</div>
              ${config.generatedBy ? `<div><strong>${isRtl ? 'أعدّه' : 'Prepared By'}:</strong> ${escapeHtml(config.generatedBy)}</div>` : ''}
            </div>
            ${colLogo}
          </div>
        </div>

        ${
          isFirst
            ? `
          <div style="margin-bottom:12px;">
            <h1 style="font-size:18px;font-weight:800;color:#0F172A;margin:0 0 4px 0;">${escapeHtml(title)}</h1>
            <div style="font-size:11px;color:#475569;"><strong>${isRtl ? 'نطاق التقرير والتصفية' : 'Scope & Filters'}:</strong> ${escapeHtml(config.appliedFilters)}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
            ${summaryHtml}
          </div>
        `
            : `
          <div style="margin-bottom:10px;font-size:12px;font-weight:700;color:#1565C0;">
            ${escapeHtml(title)} — ${isRtl ? 'تابع' : 'Continued'} (${pageIndex + 1}/${totalPages})
          </div>
        `
        }

        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          <thead><tr>${headHtml}</tr></thead>
          <tbody>${
            bodyHtml ||
            `<tr><td colspan="${config.columns.length + 1}" style="padding:18px;text-align:center;color:#64748B;">${isRtl ? 'لا توجد سجلات مطابقة لمعايير التصفية المختارة' : 'No records match the selected filters'}</td></tr>`
          }</tbody>
        </table>

        ${
          isLast && config.officialNotes
            ? `
          <div style="margin-top:10px;padding:10px 12px;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:8px;font-size:11px;color:#334155;">
            <strong>${isRtl ? 'ملاحظات رسمية:' : 'Official Remarks:'}</strong> ${escapeHtml(config.officialNotes)}
          </div>
        `
            : ''
        }
      </div>

      <div>
        ${
          isLast && config.includeSignatures !== false
            ? `
          <div style="margin-top:18px;padding-top:14px;border-top:1px solid #CBD5E1;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;font-size:11px;color:#334155;">
            <div>
              <div style="font-weight:700;margin-bottom:26px;">${isRtl ? 'توقيع مسؤول شعبة الدراسات العليا' : 'Postgraduate Studies Officer'}</div>
              <div style="border-top:1px dashed #94A3B8;width:190px;padding-top:4px;">${isRtl ? 'الاسم والتوقيع والتاريخ' : 'Name, Signature & Date'}</div>
            </div>
            <div style="text-align:center;border:1px dashed #CBD5E1;border-radius:10px;padding:10px 18px;color:#64748B;font-size:10px;">
              ${isRtl ? 'مكان الختم الرسمي للكلية / الشعبة' : 'Official College / Dept Seal'}
            </div>
            <div>
              <div style="font-weight:700;margin-bottom:26px;">${isRtl ? 'مصادقة عميد الكلية / رئيس القسم العلمي' : 'Dean / Department Chair Approval'}</div>
              <div style="border-top:1px dashed #94A3B8;width:190px;padding-top:4px;">${isRtl ? 'التوقيع والاعتماد' : 'Signature & Approval'}</div>
            </div>
          </div>
        `
            : ''
        }

        <div style="margin-top:12px;padding-top:8px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:9.5px;color:#64748B;">
          <span>SGAS · ${escapeHtml(uniName)} · Asia/Baghdad</span>
          <span style="font-family:'IBM Plex Mono',monospace;">${isRtl ? `صفحة ${pageIndex + 1} من ${totalPages}` : `Page ${pageIndex + 1} of ${totalPages}`}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generates and downloads a multi-page, Arabic-compatible RTL/LTR institutional PDF
 * with zero sliced table rows, university letterhead, document ref, and official signatures.
 */
export async function exportInstitutionalPdf(config: InstitutionalReportConfig): Promise<void> {
  const orientation = config.orientation || (config.columns.length >= 7 ? 'landscape' : 'portrait');
  const firstPageSize = orientation === 'landscape' ? 12 : 18;
  const nextPageSize = orientation === 'landscape' ? 18 : 26;
  const pages = paginateReportRows(config.rows, firstPageSize, nextPageSize);

  const containerWidth = orientation === 'landscape' ? 1240 : 900;
  const containerMinHeight = orientation === 'landscape' ? 860 : 1260;

  const pdf = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-12000px';
  host.style.top = '0';
  host.style.width = `${containerWidth}px`;
  host.style.backgroundColor = '#FFFFFF';
  document.body.appendChild(host);

  try {
    let rowOffset = 0;
    for (let i = 0; i < pages.length; i++) {
      const pageRows = pages[i];
      host.innerHTML = `<div style="width:${containerWidth}px;min-height:${containerMinHeight}px;background:#FFFFFF;">${buildOfficialReportHtmlPage(
        config,
        pageRows,
        i,
        pages.length,
        rowOffset,
      )}</div>`;
      rowOffset += pageRows.length;

      const pageEl = host.firstElementChild as HTMLElement;
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
      });
      const imgData = canvas.toDataURL('image/png');
      const renderedHeight = (canvas.height * pageWidth) / canvas.width;
      const drawHeight = Math.min(pageHeight, renderedHeight);

      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, drawHeight);
    }

    pdf.save(`${config.filename}.pdf`);
  } finally {
    document.body.removeChild(host);
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
