export type InjuryStatus =
  | 'Fatal'
  | 'Grievous Injury'
  | 'Minor Injury'
  | 'Uninjured';

export interface Vehicle {
  client_vehicle_id: string;
  vehicle_category: string;
  registration_number?: string;
  vehicle_make_model?: string;
  movement_direction?: string;
  damage_description?: string;
}

export interface Person {
  client_person_id: string;
  client_vehicle_id?: string;
  person_role: 'Driver' | 'Passenger' | 'Pedestrian' | 'Cyclist';
  name?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  injury_status: InjuryStatus;
  hospital_name?: string;
  helmet_seatbelt_used?: boolean;
}

export interface EvidenceItem {
  client_evidence_id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  sha256_hash: string;
  data_url: string; // Base64 thumbnail preview
  caption?: string;
  gps_lat?: number;
  gps_long?: number;
  upload_status: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
  uploaded_at?: string;
  error_message?: string;
}

export interface AccidentReportData {
  // Section 1: Accident Information
  reference_number?: string;
  accident_date: string;
  accident_time: string;
  accident_category: string;
  accident_nature: string;
  severity: string;

  // Section 2: Accident Location
  state: string;
  district: string;
  police_station: string;
  road_name?: string;
  exact_location: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy?: number;

  // Section 3: Road & Environmental Conditions
  road_type?: string;
  surface_condition?: string;
  road_geometry?: string;
  weather_condition?: string;
  visibility?: string;
  lighting_condition?: string;
  signage_present?: boolean;

  // Section 4 & 5: Relational dynamic collections
  vehicles: Vehicle[];
  persons: Person[];

  // Section 6: Accident Description
  accident_description: string;
  /** AI suggestions remain separate until the officer explicitly approves them. */
  ai_narrative_draft?: AITranscriptDraft;

  // Section 7: Evidence
  evidence: EvidenceItem[];
}

export type SyncStatus = 'SAVED_LOCAL' | 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface LocalReport {
  client_report_id: string;
  server_report_id?: string;
  status: SyncStatus;
  created_at: string;
  updated_at: string;
  synced_at?: string;
  last_error?: string;
  officer_id: string;
  officer_badge: string;
  data: AccidentReportData;
}

export type FieldOrderMode = 'MODE_A_REQUIRED_FIRST' | 'MODE_B_OFFICIAL_EDAR';

export interface ValidationErrorItem {
  sectionIndex: number;
  sectionName: string;
  fieldKey: string;
  label: string;
  message: string;
}
import type { AITranscriptDraft } from './ai.types';
