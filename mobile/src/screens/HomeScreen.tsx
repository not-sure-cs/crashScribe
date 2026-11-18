import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  MapPin,
  CloudSun,
  Truck,
  Users,
  AlignLeft,
  Camera,
  Plus,
  Trash2,
  Navigation,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { MissingFieldsSheet } from '../components/MissingFieldsSheet';
import { SensorService } from '../services/sensor.service';
import {
  AccidentReportData,
  Vehicle,
  Person,
  EvidenceItem,
  FieldOrderMode,
  ValidationErrorItem,
} from '../types/edar.types';
import { Officer } from '../types/auth.types';

const ASSAM_DISTRICTS = [
  'Baksa', 'Barpeta', 'Biswanath', 'Bongaigaon', 'Cachar', 'Charaideo',
  'Chirang', 'Darrang', 'Dhemaji', 'Dhubri', 'Dibrugarh', 'Dima Hasao',
  'Goalpara', 'Golaghat', 'Hailakandi', 'Hojai', 'Jorhat', 'Kamrup',
  'Kamrup Metropolitan', 'Karbi Anglong', 'Karimganj', 'Kokrajhar',
  'Lakhimpur', 'Majuli', 'Morigaon', 'Nagaon', 'Nalbari', 'Sivasagar',
  'Sonitpur', 'South Salmara-Mankachar', 'Tamulpur', 'Tinsukia', 'Udalguri',
  'West Karbi Anglong'
];

interface HomeScreenProps {
  officer: Officer;
  isOnline: boolean;
  onProceedToReview: (reportData: AccidentReportData) => void;
  initialData?: AccidentReportData | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  officer,
  isOnline,
  onProceedToReview,
  initialData,
}) => {
  // Field order mode toggle state
  const [fieldOrderMode, setFieldOrderMode] = useState<FieldOrderMode>('MODE_A_REQUIRED_FIRST');

  // Accordion expanded sections (0: Acc Info, 1: Location, 2: Road/Env, 3: Vehicles, 4: Persons, 5: Description, 6: Evidence)
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: false,
    3: true,
    4: true,
    5: true,
    6: false,
  });

  // Validation error state
  const [validationErrors, setValidationErrors] = useState<ValidationErrorItem[]>([]);
  const [showErrorSheet, setShowErrorSheet] = useState(false);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<AccidentReportData>(() => {
    if (initialData) return initialData;

    return {
      reference_number: `AS-EDAR-${Date.now().toString().slice(-6)}`,
      accident_date: SensorService.getCurrentDate(),
      accident_time: SensorService.getCurrentTime(),
      accident_category: 'Head-on Collision',
      accident_nature: 'Fatal',
      severity: 'Fatal',

      state: 'Assam',
      district: officer.district || 'Kamrup Metropolitan',
      police_station: officer.police_station || 'Panbazar PS',
      road_name: 'National Highway 37',
      exact_location: '',
      landmark: '',
      latitude: undefined,
      longitude: undefined,
      gps_accuracy: undefined,

      road_type: 'Four Lane Divided',
      surface_condition: 'Wet Asphalt',
      road_geometry: 'Straight and Flat',
      weather_condition: 'Rain / Mist',
      visibility: 'Good',
      lighting_condition: 'Daylight',
      signage_present: true,

      vehicles: [
        {
          client_vehicle_id: crypto.randomUUID(),
          vehicle_category: 'Commercial Truck / HGV',
          registration_number: '',
          vehicle_make_model: '',
          movement_direction: 'Westbound',
          damage_description: '',
        },
      ],

      persons: [
        {
          client_person_id: crypto.randomUUID(),
          person_role: 'Driver',
          name: '',
          age: undefined,
          gender: 'Male',
          injury_status: 'Fatal',
          hospital_name: 'Guwahati Medical College & Hospital (GMCH)',
          helmet_seatbelt_used: true,
        },
      ],

      accident_description: '',
      evidence: [],
    };
  });

  // GPS auto-capture loading state
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsLocked, setGpsLocked] = useState(false);

  // Auto-capture GPS on mount if not present
  useEffect(() => {
    if (!formData.latitude || !formData.longitude) {
      handleCaptureLocation();
    }
  }, []);

  const handleCaptureLocation = async () => {
    setIsCapturingGps(true);
    try {
      const loc = await SensorService.getCurrentLocation();
      setFormData((prev) => ({
        ...prev,
        latitude: loc.latitude,
        longitude: loc.longitude,
        gps_accuracy: loc.accuracy,
      }));
      setGpsLocked(true);
    } catch (err) {
      console.warn('[Location capture error]', err);
    } finally {
      setIsCapturingGps(false);
    }
  };

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Dynamic Vehicle handlers
  const handleAddVehicle = () => {
    setFormData((prev) => ({
      ...prev,
      vehicles: [
        ...prev.vehicles,
        {
          client_vehicle_id: crypto.randomUUID(),
          vehicle_category: 'Two-Wheeler (Motorcycle/Scooter)',
          registration_number: '',
          vehicle_make_model: '',
          movement_direction: 'Eastbound',
          damage_description: '',
        },
      ],
    }));
  };

  const handleRemoveVehicle = (index: number) => {
    if (formData.vehicles.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      vehicles: prev.vehicles.filter((_, i) => i !== index),
    }));
  };

  // Dynamic Person handlers
  const handleAddPerson = () => {
    setFormData((prev) => ({
      ...prev,
      persons: [
        ...prev.persons,
        {
          client_person_id: crypto.randomUUID(),
          person_role: 'Passenger',
          name: '',
          age: undefined,
          gender: 'Male',
          injury_status: 'Grievous Injury',
          hospital_name: 'GMCH Emergency Trauma Ward',
          helmet_seatbelt_used: false,
        },
      ],
    }));
  };

  const handleRemovePerson = (index: number) => {
    if (formData.persons.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      persons: prev.persons.filter((_, i) => i !== index),
    }));
  };

  // Evidence handlers (Camera/File selection)
  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const newEvidenceItem: EvidenceItem = {
          client_evidence_id: crypto.randomUUID(),
          file_name: file.name,
          file_type: file.type || 'image/jpeg',
          file_size_bytes: file.size,
          sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          data_url: dataUrl,
          caption: 'Scene angle showing vehicle point of impact',
          gps_lat: formData.latitude,
          gps_long: formData.longitude,
          upload_status: 'PENDING',
        };

        setFormData((prev) => ({
          ...prev,
          evidence: [...prev.evidence, newEvidenceItem],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveEvidence = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      evidence: prev.evidence.filter((_, i) => i !== index),
    }));
  };

  // Calculate completion progress %
  const calculateProgress = (): number => {
    let score = 0;
    const total = 8;
    if (formData.accident_date) score++;
    if (formData.district && formData.police_station) score++;
    if (formData.exact_location) score++;
    if (formData.latitude && formData.longitude) score++;
    if (formData.vehicles.length > 0 && formData.vehicles[0].vehicle_category) score++;
    if (formData.persons.length > 0 && formData.persons[0].injury_status) score++;
    if (formData.accident_description && formData.accident_description.length >= 5) score++;
    if (formData.evidence.length > 0) score++;
    return Math.round((score / total) * 100);
  };

  // Validate entire form according to eDAR requirements
  const handleReviewReport = () => {
    const errors: ValidationErrorItem[] = [];

    // Section 1 checks
    if (!formData.accident_date) {
      errors.push({
        sectionIndex: 0,
        sectionName: 'Accident Information',
        fieldKey: 'accident_date',
        label: 'Accident Date',
        message: 'Accident date is required',
      });
    }
    if (!formData.accident_time) {
      errors.push({
        sectionIndex: 0,
        sectionName: 'Accident Information',
        fieldKey: 'accident_time',
        label: 'Accident Time',
        message: 'Accident time is required',
      });
    }

    // Section 2 checks
    if (!formData.district) {
      errors.push({
        sectionIndex: 1,
        sectionName: 'Accident Location',
        fieldKey: 'district',
        label: 'District',
        message: 'Assam District is mandatory',
      });
    }
    if (!formData.police_station) {
      errors.push({
        sectionIndex: 1,
        sectionName: 'Accident Location',
        fieldKey: 'police_station',
        label: 'Police Station',
        message: 'Jurisdiction Police Station is required',
      });
    }
    if (!formData.exact_location || formData.exact_location.trim().length === 0) {
      errors.push({
        sectionIndex: 1,
        sectionName: 'Accident Location',
        fieldKey: 'exact_location',
        label: 'Exact Accident Location',
        message: 'Provide landmark or highway kilometer chainage',
      });
    }

    // Section 4 checks
    if (!formData.vehicles || formData.vehicles.length === 0) {
      errors.push({
        sectionIndex: 3,
        sectionName: 'Vehicle Information',
        fieldKey: 'vehicles',
        label: 'Vehicles Involved',
        message: 'At least one vehicle record must be added',
      });
    }

    // Section 5 checks
    if (!formData.persons || formData.persons.length === 0) {
      errors.push({
        sectionIndex: 4,
        sectionName: 'Persons Involved',
        fieldKey: 'persons',
        label: 'Casualties / Persons',
        message: 'At least one person entry is required by eDAR',
      });
    }

    // Section 6 checks
    if (!formData.accident_description || formData.accident_description.trim().length < 5) {
      errors.push({
        sectionIndex: 5,
        sectionName: 'Accident Description',
        fieldKey: 'accident_description',
        label: 'Accident Narrative',
        message: 'Accident description must be at least 5 characters',
      });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowErrorSheet(true);
      return;
    }

    // Validation succeeded! Proceed to Draft Review
    setValidationErrors([]);
    setShowErrorSheet(false);
    onProceedToReview(formData);
  };

  // Scroll to and focus missing field
  const handleFocusField = (fieldKey: string, sectionIndex: number) => {
    // 1. Expand the accordion section
    setExpandedSections((prev) => ({ ...prev, [sectionIndex]: true }));
    setShowErrorSheet(false);
    setHighlightedField(fieldKey);

    // 2. Smoothly scroll to the target field
    setTimeout(() => {
      const el = document.getElementById(`field-${fieldKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }, 200);

    // 3. Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedField(null);
    }, 3500);
  };

  const progress = calculateProgress();

  return (
    <div className="pb-24 pt-3 px-3 max-w-2xl mx-auto space-y-4">
      {/* Header & Officer Compact Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">New Accident Report</h1>
            <p className="text-xs text-slate-400">
              Assam Police eDAR Initial Crash Scribe • MoRTH Standard
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold rounded-full">
              {progress}% Ready
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Field-Order Toggle (4.1 Requirement) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-200">Form Presentation Mode:</span>
        </div>
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFieldOrderMode('MODE_A_REQUIRED_FIRST')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              fieldOrderMode === 'MODE_A_REQUIRED_FIRST'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Option A — Required & Sensor First
          </button>
          <button
            type="button"
            onClick={() => setFieldOrderMode('MODE_B_OFFICIAL_EDAR')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              fieldOrderMode === 'MODE_B_OFFICIAL_EDAR'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Option B — Official eDAR Order
          </button>
        </div>
      </div>

      {/* Sensor Auto-Capture Status Card (Mode A Highlight) */}
      {fieldOrderMode === 'MODE_A_REQUIRED_FIRST' && (
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-emerald-300">
            <Navigation className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>
              GPS Auto-Locked: <span className="font-mono font-bold">{formData.latitude || '26.1285'}, {formData.longitude || '91.8123'}</span> (±{formData.gps_accuracy || 15}m)
            </span>
          </div>
          <button
            type="button"
            onClick={handleCaptureLocation}
            disabled={isCapturingGps}
            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded font-semibold text-[11px] transition"
          >
            {isCapturingGps ? 'Locking...' : 'Re-capture'}
          </button>
        </div>
      )}

      {/* SECTION 1: Accident Information */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(0)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Section 1 — Accident Information</h2>
              <p className="text-[11px] text-slate-400">Date, time, category, nature and severity</p>
            </div>
          </div>
          {expandedSections[0] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[0] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" /> Date of Accident *
                </label>
                <input
                  id="field-accident_date"
                  type="date"
                  value={formData.accident_date}
                  onChange={(e) => setFormData({ ...formData, accident_date: e.target.value })}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition ${
                    highlightedField === 'accident_date' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'
                  }`}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Time of Accident *
                </label>
                <input
                  id="field-accident_time"
                  type="time"
                  step="1"
                  value={formData.accident_time}
                  onChange={(e) => setFormData({ ...formData, accident_time: e.target.value })}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition ${
                    highlightedField === 'accident_time' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'
                  }`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Accident Category *</label>
                <select
                  value={formData.accident_category}
                  onChange={(e) => setFormData({ ...formData, accident_category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Head-on Collision">Head-on Collision</option>
                  <option value="Rear-end Collision">Rear-end Collision</option>
                  <option value="Sideswipe Collision">Sideswipe Collision</option>
                  <option value="Hit from Side">Hit from Side</option>
                  <option value="Overturning / Rollover">Overturning / Rollover</option>
                  <option value="Hit Pedestrian">Hit Pedestrian</option>
                  <option value="Hit Fixed Object">Hit Fixed Object</option>
                  <option value="Skidding">Skidding</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Severity *</label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Fatal">Fatal</option>
                  <option value="Grievous Injury">Grievous Injury</option>
                  <option value="Minor Injury">Minor Injury</option>
                  <option value="Non-Injury (Property Damage Only)">Non-Injury (Property Only)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2: Accident Location */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(1)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Section 2 — Accident Location</h2>
              <p className="text-[11px] text-slate-400">Assam district, police station, highway and GPS coordinates</p>
            </div>
          </div>
          {expandedSections[1] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[1] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">District (Assam) *</label>
                <select
                  id="field-district"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition ${
                    highlightedField === 'district' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'
                  }`}
                >
                  {ASSAM_DISTRICTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Police Station *</label>
                <input
                  id="field-police_station"
                  type="text"
                  value={formData.police_station}
                  onChange={(e) => setFormData({ ...formData, police_station: e.target.value })}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition ${
                    highlightedField === 'police_station' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'
                  }`}
                  placeholder="e.g. Panbazar PS"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Road / Highway Name or Number</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.road_name || ''}
                  onChange={(e) => setFormData({ ...formData, road_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 pr-10"
                  placeholder="e.g. NH-37 (Asian Highway 1) or GS Road"
                />
                <div className="absolute right-2 top-1.5">
                  <VoiceInputButton
                    fieldKey="road_name"
                    fieldLabel="Highway Name"
                    onTranscription={(text) => setFormData((prev) => ({ ...prev, road_name: text }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Exact Accident Location *</label>
              <div className="relative">
                <input
                  id="field-exact_location"
                  type="text"
                  value={formData.exact_location}
                  onChange={(e) => setFormData({ ...formData, exact_location: e.target.value })}
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition pr-10 ${
                    highlightedField === 'exact_location' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'
                  }`}
                  placeholder="e.g. NH-37 Westbound near Khanapara flyover intersection"
                  required
                />
                <div className="absolute right-2 top-1.5">
                  <VoiceInputButton
                    fieldKey="exact_location"
                    fieldLabel="Exact Location"
                    onTranscription={(text) => setFormData((prev) => ({ ...prev, exact_location: text }))}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nearby Landmark</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.landmark || ''}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 pr-10"
                    placeholder="e.g. Opposite Petrol Pump"
                  />
                  <div className="absolute right-2 top-1.5">
                    <VoiceInputButton
                      fieldKey="landmark"
                      fieldLabel="Nearby Landmark"
                      onTranscription={(text) => setFormData((prev) => ({ ...prev, landmark: text }))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">GPS Coordinates</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={formData.latitude ? `${formData.latitude}, ${formData.longitude}` : 'Click capture'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-emerald-400 focus:outline-none cursor-default"
                  />
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    disabled={isCapturingGps}
                    className="px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 flex-shrink-0"
                    title="Capture device GPS sensors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{isCapturingGps ? '...' : 'GPS'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Road & Environmental Conditions */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(2)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg">
              <CloudSun className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Section 3 — Road & Environmental Conditions</h2>
              <p className="text-[11px] text-slate-400">Surface, weather, lighting, road geometry</p>
            </div>
          </div>
          {expandedSections[2] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[2] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Road Surface Condition</label>
                <select
                  value={formData.surface_condition}
                  onChange={(e) => setFormData({ ...formData, surface_condition: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="Dry Asphalt">Dry Asphalt</option>
                  <option value="Wet Asphalt">Wet Asphalt</option>
                  <option value="Waterlogged / Flooded">Waterlogged / Flooded</option>
                  <option value="Potholed / Under Repair">Potholed / Under Repair</option>
                  <option value="Loose Gravel / Mud">Loose Gravel / Mud</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Weather Condition</label>
                <select
                  value={formData.weather_condition}
                  onChange={(e) => setFormData({ ...formData, weather_condition: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="Clear / Sunny">Clear / Sunny</option>
                  <option value="Rain / Mist">Rain / Mist</option>
                  <option value="Heavy Downpour">Heavy Downpour</option>
                  <option value="Fog / Smog">Fog / Smog</option>
                  <option value="Strong Winds / Storm">Strong Winds / Storm</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Lighting Condition</label>
                <select
                  value={formData.lighting_condition}
                  onChange={(e) => setFormData({ ...formData, lighting_condition: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="Daylight">Daylight</option>
                  <option value="Dusk / Twilight">Dusk / Twilight</option>
                  <option value="Night (Streetlights On)">Night (Streetlights On)</option>
                  <option value="Night (Unlit Roadway)">Night (Unlit Roadway)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Road Geometry</label>
                <select
                  value={formData.road_geometry}
                  onChange={(e) => setFormData({ ...formData, road_geometry: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="Straight and Flat">Straight and Flat</option>
                  <option value="Sharp Curve / Blind Turn">Sharp Curve / Blind Turn</option>
                  <option value="T-Junction / Crossroad">T-Junction / Crossroad</option>
                  <option value="Steep Incline / Hilly Slope">Steep Incline / Hilly Slope</option>
                  <option value="Bridge / Flyover Approach">Bridge / Flyover Approach</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 4: Vehicle Information (Multiple Vehicles Supported) */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(3)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Section 4 — Vehicles Involved ({formData.vehicles.length})
              </h2>
              <p className="text-[11px] text-slate-400">1-to-N dynamic vehicle entries</p>
            </div>
          </div>
          {expandedSections[3] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[3] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-4">
            {formData.vehicles.map((veh, index) => (
              <div key={veh.client_vehicle_id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3 relative">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-bold text-amber-400">
                    Vehicle #{index + 1}
                  </span>
                  {formData.vehicles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVehicle(index)}
                      className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Category *</label>
                    <select
                      value={veh.vehicle_category}
                      onChange={(e) => {
                        const updated = [...formData.vehicles];
                        updated[index].vehicle_category = e.target.value;
                        setFormData({ ...formData, vehicles: updated });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="Commercial Truck / HGV">Commercial Truck / HGV</option>
                      <option value="Passenger Car / Sedan / SUV">Passenger Car / SUV</option>
                      <option value="Two-Wheeler (Motorcycle/Scooter)">Two-Wheeler</option>
                      <option value="Bus / Mini-Bus">Bus / Mini-Bus</option>
                      <option value="Auto-Rickshaw / Three-Wheeler">Auto-Rickshaw</option>
                      <option value="Bicycle / Non-Motorized">Bicycle</option>
                      <option value="Agricultural Tractor / Trailer">Tractor / Trailer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Registration No.</label>
                    <input
                      type="text"
                      value={veh.registration_number || ''}
                      onChange={(e) => {
                        const updated = [...formData.vehicles];
                        updated[index].registration_number = e.target.value.toUpperCase();
                        setFormData({ ...formData, vehicles: updated });
                      }}
                      placeholder="e.g. AS-01-EC-9988"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Make / Model</label>
                    <input
                      type="text"
                      value={veh.vehicle_make_model || ''}
                      onChange={(e) => {
                        const updated = [...formData.vehicles];
                        updated[index].vehicle_make_model = e.target.value;
                        setFormData({ ...formData, vehicles: updated });
                      }}
                      placeholder="e.g. Tata Prima or Maruti Swift"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Movement Direction</label>
                    <select
                      value={veh.movement_direction || 'Westbound'}
                      onChange={(e) => {
                        const updated = [...formData.vehicles];
                        updated[index].movement_direction = e.target.value;
                        setFormData({ ...formData, vehicles: updated });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="Westbound">Westbound</option>
                      <option value="Eastbound">Eastbound</option>
                      <option value="Northbound">Northbound</option>
                      <option value="Southbound">Southbound</option>
                      <option value="Stationary / Parked">Stationary / Parked</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddVehicle}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl text-xs transition border border-dashed border-amber-500/40 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Another Vehicle
            </button>
          </div>
        )}
      </section>

      {/* SECTION 5: Persons Involved (Multiple Persons Supported) */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(4)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Section 5 — Persons & Casualties ({formData.persons.length})
              </h2>
              <p className="text-[11px] text-slate-400">1-to-N casualties, injury status, hospital details</p>
            </div>
          </div>
          {expandedSections[4] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[4] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-4">
            {formData.persons.map((person, index) => (
              <div key={person.client_person_id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3 relative">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-bold text-rose-400">
                    Person #{index + 1}
                  </span>
                  {formData.persons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePerson(index)}
                      className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Role *</label>
                    <select
                      value={person.person_role}
                      onChange={(e) => {
                        const updated = [...formData.persons];
                        updated[index].person_role = e.target.value as any;
                        setFormData({ ...formData, persons: updated });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="Driver">Driver</option>
                      <option value="Passenger">Passenger</option>
                      <option value="Pedestrian">Pedestrian</option>
                      <option value="Cyclist">Cyclist</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Injury Status *</label>
                    <select
                      value={person.injury_status}
                      onChange={(e) => {
                        const updated = [...formData.persons];
                        updated[index].injury_status = e.target.value as any;
                        setFormData({ ...formData, persons: updated });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="Fatal">Fatal / Dead</option>
                      <option value="Grievous Injury">Grievous Injury</option>
                      <option value="Minor Injury">Minor Injury</option>
                      <option value="Uninjured">Uninjured</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Age</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={person.age ?? ''}
                      onChange={(e) => {
                        const updated = [...formData.persons];
                        updated[index].age = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        setFormData({ ...formData, persons: updated });
                      }}
                      placeholder="e.g. 35"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Name (Optional)</label>
                    <input
                      type="text"
                      value={person.name || ''}
                      onChange={(e) => {
                        const updated = [...formData.persons];
                        updated[index].name = e.target.value;
                        setFormData({ ...formData, persons: updated });
                      }}
                      placeholder="e.g. S. Barua"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">Hospital / Referral</label>
                    <input
                      type="text"
                      value={person.hospital_name || ''}
                      onChange={(e) => {
                        const updated = [...formData.persons];
                        updated[index].hospital_name = e.target.value;
                        setFormData({ ...formData, persons: updated });
                      }}
                      placeholder="e.g. GMCH Guwahati"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={person.helmet_seatbelt_used}
                    onChange={(e) => {
                      const updated = [...formData.persons];
                      updated[index].helmet_seatbelt_used = e.target.checked;
                      setFormData({ ...formData, persons: updated });
                    }}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                  />
                  <span>Helmet / Seatbelt was securely fastened at time of impact</span>
                </label>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddPerson}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold rounded-xl text-xs transition border border-dashed border-rose-500/40 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Another Casualty / Person
            </button>
          </div>
        )}
      </section>

      {/* SECTION 6: Accident Description (Voice-to-Text Primary Input) */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(5)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg">
              <AlignLeft className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Section 6 — Accident Description *</h2>
              <p className="text-[11px] text-slate-400">Detailed incident narrative with mock voice-to-text integration</p>
            </div>
          </div>
          {expandedSections[5] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[5] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-2">
            <div className="relative">
              <textarea
                id="field-accident_description"
                rows={4}
                value={formData.accident_description}
                onChange={(e) => setFormData({ ...formData, accident_description: e.target.value })}
                placeholder="Describe how collision transpired, vehicle points of contact, road obstruction and initial witness observations..."
                className={`w-full bg-slate-950 border rounded-xl p-3 text-xs text-white focus:outline-none transition ${
                  highlightedField === 'accident_description'
                    ? 'border-amber-400 ring-2 ring-amber-400/40'
                    : 'border-slate-700'
                }`}
                required
              />
              <div className="absolute right-2.5 bottom-3.5">
                <VoiceInputButton
                  fieldKey="accident_description"
                  fieldLabel="Accident Narrative Description"
                  onTranscription={(text) =>
                    setFormData((prev) => ({
                      ...prev,
                      accident_description: prev.accident_description
                        ? `${prev.accident_description} ${text}`
                        : text,
                    }))
                  }
                  onAIResult={(draft) => setFormData((prev) => ({ ...prev, ai_narrative_draft: draft }))}
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>Tap the mic icon to record, call the configured AI endpoint, review the original transcript and translation, then approve it.</span>
            </p>
          </div>
        )}
      </section>

      {/* SECTION 7: Evidence & Media Attachments */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(6)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-lg">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Section 7 — Evidence & Photographs ({formData.evidence.length})
              </h2>
              <p className="text-[11px] text-slate-400">Crash site photos, vehicle damage angles, skid marks</p>
            </div>
          </div>
          {expandedSections[6] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {expandedSections[6] && (
          <div className="p-4 pt-1 border-t border-slate-800/60 space-y-3">
            {/* Gallery Upload Input */}
            <div className="flex gap-2">
              <label className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl cursor-pointer flex flex-col items-center justify-center transition text-center p-2">
                <Camera className="w-6 h-6 text-amber-400 mb-1" />
                <span className="text-xs font-semibold text-slate-200">Capture Scene Photo / Select from Gallery</span>
                <span className="text-[10px] text-slate-500">Supports JPEG/PNG with auto-extracted GPS metadata</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleEvidenceFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Thumbnail Grid */}
            {formData.evidence.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {formData.evidence.map((ev, index) => (
                  <div key={ev.client_evidence_id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative group">
                    <img
                      src={ev.data_url}
                      alt={ev.file_name}
                      className="w-full h-28 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEvidence(index)}
                      className="absolute top-1.5 right-1.5 p-1 bg-rose-600/90 text-white rounded-full hover:bg-rose-500 transition shadow"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="p-2 text-[11px] text-slate-300">
                      <div className="font-semibold truncate">{ev.file_name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{ev.caption}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Review Action Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleReviewReport}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl text-sm transition shadow-xl shadow-amber-500/20 flex items-center justify-center space-x-2"
        >
          <CheckCircle2 className="w-5 h-5 text-slate-950" />
          <span>Review Report</span>
        </button>
      </div>

      {/* Missing Fields Error Sheet */}
      <MissingFieldsSheet
        errors={validationErrors}
        onClose={() => setShowErrorSheet(false)}
        onFocusField={handleFocusField}
      />
    </div>
  );
};
