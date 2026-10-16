export const DOC_CATEGORIES = [
  { value: "company_registration", label: "Company registration (CIPC)" },
  { value: "tax_compliance", label: "Tax compliance status (SARS PIN)" },
  { value: "bbbee", label: "B-BBEE certificate / affidavit" },
  { value: "csd", label: "CSD registration summary" },
  { value: "cidb", label: "CIDB registration" },
  { value: "coid", label: "COID letter of good standing" },
  { value: "safety_file", label: "Health & safety file" },
  { value: "insurance", label: "Insurance (public liability)" },
  { value: "training", label: "Training records" },
  { value: "competency", label: "Competency certificates (MHSA)" },
  { value: "banking", label: "Bank confirmation letter" },
  { value: "other", label: "Other" },
] as const;

export function categoryLabel(v: string) {
  return DOC_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const EXPIRY_WARNING_DAYS = 30;

export const PROJECT_STATUSES = ["draft", "open", "closed", "awarded", "cancelled"] as const;
export const REVIEW_STATUSES = ["submitted", "under_review", "shortlisted", "unsuccessful"] as const;

export function humanize(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
