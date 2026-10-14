import type { EmploymentType, TaxScale } from './payroll.ts';

export type Role = 'driver' | 'office';

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  phone: string | null;
  business_name: string | null;
  abn: string | null;
  address: string | null;
  gst_registered: boolean;
  hourly_rate: number;
  active: boolean;
  tracking_consent_at: string | null;
  on_duty: boolean;
  on_duty_since: string | null;
  shift_type?: 'day' | 'night';
  duty_breach_at?: string | null;
  licence_number: string | null;
  licence_class: string | null;
  licence_state: string | null;
  licence_expiry: string | null;
  start_date: string | null;
  pay_type: 'abn' | 'tfn';
  employment_type: EmploymentType;
  tax_scale: TaxScale;
  has_study_loan: boolean;
  super_fund: string | null;
  super_member_no: string | null;
};

export type Company = {
  id: number;
  name: string;
  abn: string;
  address: string;
  email: string;
  rcti_agreement: string;
  office_email?: string;
};

export type TripStatus = 'planned' | 'in_progress' | 'completed';

export type Trip = {
  id: string;
  /** 'rail': a rail base taken to Pacific National (base_id + docket number in job_ref). */
  kind?: 'load' | 'rail';
  base_id?: string | null;
  archived_at: string | null;
  accepted_at?: string | null;
  visy_trailer?: string | null;
  driver_id: string;
  trip_date: string;
  truck_rego: string;
  trailer_rego: string | null;
  customer: string | null;
  job_ref: string | null;
  pickup: string;
  dropoff: string;
  start_odometer: number | null;
  end_odometer: number | null;
  amount: number;
  notes: string | null;
  status: TripStatus;
  started_at: string | null;
  finished_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  driver?: { full_name: string } | null;
};

export type Shift = {
  id: string;
  driver_id: string;
  shift_date: string;
  start_at: string;
  end_at: string;
  break_minutes: number;
  notes: string | null;
  driver?: { full_name: string } | null;
};

export type InspectionItem = { key: string; label: string; ok: boolean; note: string; section?: 'truck' | 'trailer' };

export type Inspection = {
  id: string;
  archived_at: string | null;
  driver_id: string;
  truck_rego: string;
  trailer_rego: string | null;
  visy_trailer?: string | null;
  odometer: number | null;
  items: InspectionItem[];
  safe_to_drive: boolean;
  notes: string | null;
  photo_paths: string[];
  emailed_at: string | null;
  email_error: string | null;
  created_at: string;
  driver?: { full_name: string } | null;
};

export type Rcti = {
  id: string;
  number: number;
  driver_id: string;
  week_start: string;
  week_end: string;
  subtotal: number;
  gst: number;
  total: number;
  issued_at: string;
  pdf_path: string | null;
};

export type Payslip = {
  id: string;
  number: number;
  employee_id: string;
  week_start: string;
  week_end: string;
  pay_date: string;
  hours: number;
  gross: number;
  tax: number;
  stsl: number;
  net: number;
  super: number;
  annual_leave: number;
  personal_leave: number;
  ytd_gross: number;
  ytd_tax: number;
  ytd_super: number;
  pdf_path: string | null;
  issued_at: string;
};

export type LiveDriver = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  on_duty_since: string;
  lat: number;
  lng: number;
  speed: number | null;
  recorded_at: string;
};

export type Runsheet = {
  id: string;
  driver_id: string;
  run_date: string;
  truck_rego: string | null;
  notes: string | null;
  photo_paths: string[];
  submitted_at: string;
  reviewed_at: string | null;
  kind?: 'runsheet' | 'fuel';
  litres?: number | null;
  fuel_cost?: number | null;
  driver?: { full_name: string } | null;
};
