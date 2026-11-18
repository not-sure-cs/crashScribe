import React, { useState, useEffect } from 'react';
import {
  User,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  HardDrive,
  Edit2,
  Save,
  X,
  Shield,
  Smartphone,
  Calendar,
  MapPin,
  Clock,
  ArrowUpRight,
  LogOut,
} from 'lucide-react';
import { Officer, AuthSession } from '../types/auth.types';
import { LocalReport } from '../types/edar.types';
import { StorageService } from '../services/storage.service';
import { ApiService } from '../services/api.service';
import { BrowserAIConfig, OfflineAIService } from '../services/offlineAI.service';
import { AIModelInfo } from '../types/ai.types';

interface SettingsTabScreenProps {
  officer: Officer;
  isOnline: boolean;
  onLogout: () => void;
  onProfileUpdated: (updatedOfficer: Officer) => void;
}

export const SettingsTabScreen: React.FC<SettingsTabScreenProps> = ({
  officer,
  isOnline,
  onLogout,
  onProfileUpdated,
}) => {
  // 9.1 Officer Profile Editing State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: officer.name,
    phone: officer.phone,
    email: officer.email,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');

  const handleSaveAIConfig = (e: React.FormEvent) => {
    e.preventDefault();
    OfflineAIService.saveConfig(aiConfig);
    setModels(OfflineAIService.getModels());
    setAIConfigSaved(true);
    setTimeout(() => setAIConfigSaved(false), 3000);
  };

  // 9.2 Local Model State. The browser demo never simulates an artifact download.
  const [models, setModels] = useState<AIModelInfo[]>(OfflineAIService.getModels());
  const [aiConfig, setAIConfig] = useState<BrowserAIConfig>(OfflineAIService.getConfig());
  const [aiConfigSaved, setAIConfigSaved] = useState(false);

  // 9.3 Synchronization Centre State
  const [pendingReports, setPendingReports] = useState<LocalReport[]>([]);
  const [syncedReports, setSyncedReports] = useState<LocalReport[]>([]);
  const [syncingReportId, setSyncingReportId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load local reports from SQLite/LocalStorage
  const reloadReports = () => {
    setPendingReports(StorageService.getPendingReports());
    setSyncedReports(StorageService.getSyncedReports());
  };

  useEffect(() => {
    reloadReports();
  }, []);

  // 9.1 Save Profile Handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccessMsg('');

    try {
      const updatedOfficer: Officer = {
        ...officer,
        name: profileForm.name,
        phone: profileForm.phone,
        email: profileForm.email,
      };

      if (isOnline) {
        try {
          await ApiService.updateProfile({ phone: profileForm.phone, email: profileForm.email });
        } catch (e) {
          console.warn('[Profile Sync Warning] Saved locally:', e);
        }
      }

      // Update cached session
      const currentSession = StorageService.getSession();
      if (currentSession) {
        currentSession.officer = updatedOfficer;
        StorageService.saveSession(currentSession);
      }

      onProfileUpdated(updatedOfficer);
      setIsEditingProfile(false);
      setProfileSuccessMsg('Profile details updated successfully');
      setTimeout(() => setProfileSuccessMsg(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  // 9.3 Manual Sync: Single Report
  const handleSyncSingle = async (report: LocalReport) => {
    setSyncFeedback(null);
    setSyncingReportId(report.client_report_id);

    try {
      if (!isOnline) {
        throw new Error('Offline: No cellular network available. Local report is safely preserved on device.');
      }

      StorageService.updateSyncStatus(report.client_report_id, 'SYNCING');
      reloadReports();

      // Dispatch to Go Gateway (:8080) -> Ingestion Service (:5002)
      const result = await ApiService.syncSingleReport(report);

      StorageService.updateSyncStatus(
        report.client_report_id,
        'SYNCED',
        result.server_report_id
      );

      setSyncFeedback({
        type: 'success',
        message: `Report ${report.client_report_id.slice(0, 8)} successfully synchronized with Central Assam Database (Server ID: ${result.server_report_id.slice(0, 8)})`,
      });
    } catch (err: any) {
      StorageService.updateSyncStatus(
        report.client_report_id,
        'FAILED',
        undefined,
        err.message || 'Sync failed'
      );
      setSyncFeedback({
        type: 'error',
        message: err.message || 'Failed to sync with central database. Local copy is retained.',
      });
    } finally {
      setSyncingReportId(null);
      reloadReports();
    }
  };

  // 9.3 Manual Sync: Sync All Pending Reports
  const handleSyncAll = async () => {
    if (pendingReports.length === 0) return;
    setSyncFeedback(null);
    setIsSyncingAll(true);

    if (!isOnline) {
      setSyncFeedback({
        type: 'error',
        message: 'Network offline: Cannot reach Central Gateway. All pending reports remain preserved on device.',
      });
      setIsSyncingAll(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const report of pendingReports) {
      try {
        setSyncingReportId(report.client_report_id);
        StorageService.updateSyncStatus(report.client_report_id, 'SYNCING');
        reloadReports();

        const result = await ApiService.syncSingleReport(report);
        StorageService.updateSyncStatus(
          report.client_report_id,
          'SYNCED',
          result.server_report_id
        );
        successCount++;
      } catch (err: any) {
        StorageService.updateSyncStatus(
          report.client_report_id,
          'FAILED',
          undefined,
          err.message
        );
        failCount++;
      }
    }

    setIsSyncingAll(false);
    setSyncingReportId(null);
    reloadReports();

    if (failCount === 0) {
      setSyncFeedback({
        type: 'success',
        message: `Successfully uploaded all ${successCount} pending reports to Assam Database.`,
      });
    } else {
      setSyncFeedback({
        type: 'error',
        message: `Synced ${successCount} reports; ${failCount} failed and were safely kept in Pending queue.`,
      });
    }
  };

  return (
    <div className="pb-24 pt-3 px-3 max-w-2xl mx-auto space-y-5">
      {/* SECTION 9.1: Officer Profile */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">9.1 Officer Credentials & Profile</h2>
              <p className="text-[11px] text-slate-400">Assam Police Traffic Branch</p>
            </div>
          </div>

          {!isEditingProfile ? (
            <button
              onClick={() => setIsEditingProfile(true)}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
            >
              <Edit2 className="w-3 h-3 text-amber-400" />
              <span>Edit</span>
            </button>
          ) : (
            <button
              onClick={() => setIsEditingProfile(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {profileSuccessMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{profileSuccessMsg}</span>
          </div>
        )}

        {isEditingProfile ? (
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Officer Name</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Phone</label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Govt Email</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{profileSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Officer Name</span>
              <span className="font-bold text-white text-sm">{officer.name}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Official Badge ID</span>
              <span className="font-mono font-bold text-amber-400">{officer.official_id}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">District & Station</span>
              <span className="text-white font-medium">{officer.district} • {officer.police_station}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Designation</span>
              <span className="text-white font-medium">{officer.designation} ({officer.role})</span>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 9.3: Report Synchronization Centre (Primary Feature) */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">9.3 Report Synchronization Centre</h2>
              <p className="text-[11px] text-slate-400">Explicit Officer-Controlled Sync to Assam Central Database</p>
            </div>
          </div>

          {/* Master "Sync All Pending Reports" Button */}
          {pendingReports.length > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={isSyncingAll || syncingReportId !== null}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Syncing All...' : `Sync All (${pendingReports.length})`}</span>
            </button>
          )}
        </div>

        {/* Sync Feedback Alert */}
        {syncFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              syncFeedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
            )}
            <span>{syncFeedback.message}</span>
          </div>
        )}

        {/* Subsection A: Pending Cloud Sync */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>A. Pending Cloud Sync</span>
              <span className="px-2 py-0.2 bg-amber-500/20 text-amber-300 rounded-full text-[10px]">
                {pendingReports.length}
              </span>
            </h3>
            <span className="text-[10px] text-slate-500">Stored on Local Device</span>
          </div>

          {pendingReports.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
              ✓ All local accident reports have reached the central Assam cloud database.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingReports.map((report) => {
                const isThisSyncing = syncingReportId === report.client_report_id;
                return (
                  <div
                    key={report.client_report_id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 relative"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-amber-400 font-bold">
                            {report.client_report_id.slice(0, 8)}...
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold">
                            {report.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1 font-medium">
                          {report.data.accident_date} • {report.data.exact_location}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Saved: {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {report.data.vehicles.length} Veh • {report.data.persons.length} Casualty
                        </div>
                      </div>

                      {/* Individual Sync Button */}
                      <button
                        onClick={() => handleSyncSingle(report)}
                        disabled={isThisSyncing || isSyncingAll}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1 shadow disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isThisSyncing ? 'animate-spin' : ''}`} />
                        <span>{isThisSyncing ? 'Syncing...' : 'Sync'}</span>
                      </button>
                    </div>

                    {report.last_error && (
                      <div className="text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-500/20">
                        Error: {report.last_error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Subsection B: Successfully Synchronized */}
        <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>B. Successfully Synchronized</span>
              <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full text-[10px]">
                {syncedReports.length}
              </span>
            </h3>
            <span className="text-[10px] text-slate-500">Persisted in State DB</span>
          </div>

          {syncedReports.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
              No cloud-synchronized reports yet in this session.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {syncedReports.map((report) => (
                <div
                  key={report.client_report_id}
                  className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-slate-300 font-medium">
                      Local: {report.client_report_id.slice(0, 8)}...
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Synced
                    </span>
                  </div>

                  <div className="text-white font-medium">
                    {report.data.accident_date} • {report.data.exact_location}
                  </div>

                  <div className="text-[10px] text-slate-400 flex justify-between items-center pt-0.5 border-t border-slate-900">
                    <span>
                      Server ID: <span className="font-mono text-emerald-400">{report.server_report_id ? report.server_report_id.slice(0, 8) + '...' : 'Verified'}</span>
                    </span>
                    <span>
                      Synced at {report.synced_at ? new Date(report.synced_at).toLocaleTimeString() : 'HQ'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 9.2: Local AI Model Status */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">9.2 Local AI Model Status</h2>
            <p className="text-[11px] text-slate-400">Verified native Android artifacts only</p>
          </div>
        </div>

        <form onSubmit={handleSaveAIConfig} className="space-y-2.5 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400">Browser inference provider</div>
          <select value={aiConfig.provider} onChange={(e) => setAIConfig({ ...aiConfig, provider: e.target.value as BrowserAIConfig['provider'] })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white">
            <option value="local">Local model server (recommended for privacy)</option>
            <option value="huggingface">Hugging Face hosted inference</option>
          </select>
          <input value={aiConfig.baseUrl} onChange={(e) => setAIConfig({ ...aiConfig, baseUrl: e.target.value })} placeholder={aiConfig.provider === 'local' ? 'http://127.0.0.1:8000' : 'https://router.huggingface.co/hf-inference/models'} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
          <input value={aiConfig.token || ''} onChange={(e) => setAIConfig({ ...aiConfig, token: e.target.value })} type="password" placeholder="API token (never commit this)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
          <input value={aiConfig.asrModel} onChange={(e) => setAIConfig({ ...aiConfig, asrModel: e.target.value })} placeholder="ASR model ID" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
          <input value={aiConfig.translationUrl || ''} onChange={(e) => setAIConfig({ ...aiConfig, translationUrl: e.target.value })} placeholder="Translation URL (optional for English)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">Local API expects POST /transcribe and /translate.</span>
            <button type="submit" className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold">Save provider</button>
          </div>
          {aiConfigSaved && <div className="text-[10px] text-emerald-400">Provider settings saved. The next recording will use them.</div>}
        </form>

        <p className="text-xs text-slate-400">
          Configure a real local or hosted endpoint. The browser does not download or pretend to load model artifacts.
        </p>

        <div className="space-y-3">
          {models.map((model) => (
            <div key={model.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-bold text-white">{model.name}</div>
                  <div className="text-amber-400 text-xs font-semibold">{model.purpose}</div>
                  <div className="text-[10px] text-slate-400">Languages: {model.languages.join(', ')}</div>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
                  {model.status}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal">
                {model.purpose}
              </p>

              {model.sha256 && <div className="text-[10px] text-slate-500 font-mono">SHA-256: {model.sha256}</div>}
            </div>
          ))}
        </div>

        <div className="text-[10px] text-slate-500 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <span className="font-semibold text-slate-400">Native client required:</span> a model is not READY until its real artifact is downloaded, SHA-256 verified, atomically installed, and successfully loaded. Manual text entry remains available.
        </div>
      </section>

      {/* Logout / Switch Officer Button */}
      <div className="pt-2">
        <button
          onClick={onLogout}
          className="w-full py-3 bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-rose-400 font-bold rounded-2xl text-xs transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out Officer Account</span>
        </button>
      </div>
    </div>
  );
};
