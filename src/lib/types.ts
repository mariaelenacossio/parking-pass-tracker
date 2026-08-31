export type PassStatus = "available" | "out";
export type HolderType = "regular" | "occasional";
export type TransactionAction = "issued" | "returned" | "reminded";

export interface Pass {
  id: string;
  status: PassStatus;
  holder_name: string | null;
  holder_email: string | null;
  holder_type: HolderType | null;
  issued_at: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  notes: string | null;
}

/** Shape returned by GET /api/passes — the raw pass plus a derived field. */
export interface PassWithDuration extends Pass {
  /** Hours the pass has been checked out, or null when it is available. */
  hours_out: number | null;
}

export interface Transaction {
  id: string;
  pass_id: string;
  action: TransactionAction;
  holder_name: string | null;
  holder_email: string | null;
  holder_type: HolderType | null;
  issued_at: string | null;
  returned_at: string | null;
  duration_hours: number | null;
  created_at: string;
}

export interface IssueBody {
  passId: string;
  name: string;
  email: string;
  type: HolderType;
}

export interface ReturnBody {
  passId: string;
  email: string;
}
