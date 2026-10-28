import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { authAwareCall } from '../../../services/authAwareCall';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { formatViolationType, getViolationIcon } from '../../../utils/violationSeverity';

const getBackendOrigin = () => {
  const apiBase = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL;
  if (apiBase) {
    return String(apiBase).replace(/\/$/, '');
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  return window.location.origin.replace(/\/$/, '');
};

const normalizeEvidencePaths = (rawValue) => {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.filter(Boolean).map(String);
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map(String);
      }
    } catch {
      // fall through to treat the value as a single path
    }
    return [rawValue];
  }

  return [String(rawValue)];
};

const EVIDENCE_STATUS_LABELS = {
  no_image_in_request: 'No image sent',
  invalid_image: 'Invalid image',
  too_large: 'Image too large',
  storage_not_configured: 'Storage not configured',
  upload_failed: 'Upload failed',
  url_failed: 'Link failed',
};

const REVIEW_BADGES = {
  CONFIRMED: { label: 'Confirmed', bg: 'bg-destructive/15 text-destructive border-destructive/30' },
  FALSE_POSITIVE: { label: 'False Alarm', bg: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  UNSURE: { label: 'Unsure', bg: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  NONE: { label: 'Not Reviewed', bg: 'bg-muted text-muted-foreground border-border' },
};

const EvidenceGallery = ({ evidenceData, onClose }) => {
  const { isAuthenticated: auth0Authenticated, getAccessTokenSilently } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  const [filterStudent, setFilterStudent] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [reviews, setReviews] = useState({});
  const [savingId, setSavingId] = useState(null);
  const backendOrigin = getBackendOrigin();
  
  const allViolations = [];
  (evidenceData || []).forEach(student => {
     (student.violations || []).forEach(v => {
         allViolations.push({
             ...v,
             student_id: student.student_id,
             student_name: student.name,
             session_id: student.session_id
         });
     });
  });
  
  const uniqueStudents = [...new Set(allViolations.map(v => v.student_name))].sort();
  const uniqueTypes = [...new Set(allViolations.map(v => v.type))].sort();
  
  const filteredViolations = allViolations.filter(v => {
      const matchStudent = filterStudent === 'ALL' || v.student_name === filterStudent;
      const matchType = filterType === 'ALL' || v.type === filterType;
      return matchStudent && matchType;
  });

  const getReviewState = (v) => {
    return reviews[v.id] || {
      status: v.review_status || 'NONE',
      note: v.review_note || '',
    };
  };

  const handleNoteChange = (violationId, note) => {
    setReviews((prev) => ({
      ...prev,
      [violationId]: {
        ...(prev[violationId] || {}),
        note: note.slice(0, 300),
      },
    }));
  };

  const handleUpdateReview = async (violationId, nextStatus) => {
    const current = reviews[violationId] || {};
    const note = (current.note !== undefined ? current.note : '').trim();

    setSavingId(violationId);
    try {
      const res = await authAwareCall({
        path: `/violations/${encodeURIComponent(violationId)}/review`,
        method: 'PATCH',
        body: {
          review_status: nextStatus,
          review_note: note,
        },
        auth0Authenticated,
        getAccessTokenSilently,
        auth0Audience,
      });

      setReviews((prev) => ({
        ...prev,
        [violationId]: {
          status: res?.review_status || nextStatus,
          note: res?.review_note ?? note,
        },
      }));
    } catch (err) {
      alert(err?.detail || err?.message || 'Failed to update review status');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Icon name="Images" className="text-primary" /> Violation Evidence Gallery
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon name="X" size={20} />
          </Button>
        </div>

        <div className="p-4 border-b border-border bg-card flex flex-wrap gap-4 items-center">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-muted-foreground mb-1">Filter by Student</label>
            <select 
               className="bg-muted border border-border text-sm rounded-md px-3 py-1.5 min-w-[200px]"
               value={filterStudent} 
               onChange={(e) => setFilterStudent(e.target.value)}
            >
              <option value="ALL">All Students</option>
              {uniqueStudents.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-muted-foreground mb-1">Filter by Violation Type</label>
            <select 
               className="bg-muted border border-border text-sm rounded-md px-3 py-1.5 min-w-[200px]"
               value={filterType} 
               onChange={(e) => setFilterType(e.target.value)}
             >
              <option value="ALL">All Types</option>
              {uniqueTypes.map(t => <option key={t} value={t}>{formatViolationType(t)}</option>)}
            </select>
          </div>
          <div className="ml-auto text-sm text-muted-foreground font-medium">
             Showing {filteredViolations.length} snapshot{filteredViolations.length !== 1 && 's'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
           {filteredViolations.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Icon name="ImageOff" size={48} className="mb-4 opacity-50" />
                <p>No evidence snapshots found matching filters.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {filteredViolations.map(v => {
                 const evidencePaths = normalizeEvidencePaths(v.evidence_file);
                 const primaryEvidence = evidencePaths[0] || null;
                 const imageSrc = primaryEvidence
                   ? (primaryEvidence.startsWith('http://') || primaryEvidence.startsWith('https://')
                      ? primaryEvidence
                      : `${backendOrigin}${primaryEvidence}`)
                   : null;

                 const reviewState = getReviewState(v);
                 const badgeInfo = REVIEW_BADGES[reviewState.status] || REVIEW_BADGES.NONE;
                 const isSaving = savingId === v.id;

                 return (
                 <div key={v.id} className="bg-card border border-border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                   <div className="h-44 bg-black flex items-center justify-center relative group">
                      {imageSrc ? (
                        <img 
                          src={imageSrc}
                          alt={v.type}
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-xs text-muted-foreground p-2 text-center gap-1">
                          <Icon name="CameraOff" size={20} className="opacity-50" />
                          <span>{EVIDENCE_STATUS_LABELS[v.evidence_status] || 'No snapshot captured'}</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                         <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded shadow-sm ${v.severity === 'severe' ? 'bg-destructive/90 text-white' : v.severity === 'major' ? 'bg-warning/90 text-white' : 'bg-primary/90 text-white'}`}>
                           {v.severity}
                         </span>
                         {evidencePaths.length > 1 && (
                           <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded shadow-sm bg-black/70 text-white">
                             +{evidencePaths.length - 1}
                           </span>
                         )}
                      </div>
                   </div>

                   <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                     <div>
                       <div className="flex items-center justify-between gap-1 mb-1">
                         <h3 className="font-semibold text-sm truncate" title={v.student_name}>{v.student_name}</h3>
                         <span className={`px-2 py-0.5 text-[10px] font-semibold border rounded-md whitespace-nowrap ${badgeInfo.bg}`}>
                           {badgeInfo.label}
                         </span>
                       </div>
                       <div className="flex justify-between items-center text-xs text-muted-foreground">
                         <span className="font-medium flex items-center gap-1 truncate">
                           <Icon name={getViolationIcon(v.type)} size={13} className="shrink-0" />
                           {formatViolationType(v.type)}
                         </span>
                         <span className="text-[10px] shrink-0">{v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ''}</span>
                       </div>
                     </div>

                     {/* Review Note & Buttons */}
                     <div className="pt-2 border-t border-border/60 space-y-2">
                       <input
                         type="text"
                         maxLength={300}
                         placeholder="Review note (max 300 chars)..."
                         value={reviewState.note}
                         onChange={(e) => handleNoteChange(v.id, e.target.value)}
                         disabled={isSaving}
                         className="w-full px-2 py-1 text-xs rounded bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                       />

                       <div className="flex items-center gap-1.5">
                         <button
                           type="button"
                           disabled={isSaving}
                           onClick={() => handleUpdateReview(v.id, 'CONFIRMED')}
                           className={`flex-1 py-1 px-1.5 rounded text-[11px] font-medium border transition-colors ${
                             reviewState.status === 'CONFIRMED'
                               ? 'bg-destructive text-white border-destructive'
                               : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                           }`}
                         >
                           Confirm
                         </button>
                         <button
                           type="button"
                           disabled={isSaving}
                           onClick={() => handleUpdateReview(v.id, 'FALSE_POSITIVE')}
                           className={`flex-1 py-1 px-1.5 rounded text-[11px] font-medium border transition-colors ${
                             reviewState.status === 'FALSE_POSITIVE'
                               ? 'bg-emerald-600 text-white border-emerald-600'
                               : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                           }`}
                         >
                           False alarm
                         </button>
                         <button
                           type="button"
                           disabled={isSaving}
                           onClick={() => handleUpdateReview(v.id, 'UNSURE')}
                           className={`flex-1 py-1 px-1.5 rounded text-[11px] font-medium border transition-colors ${
                             reviewState.status === 'UNSURE'
                               ? 'bg-amber-600 text-white border-amber-600'
                               : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                           }`}
                         >
                           Unsure
                         </button>
                       </div>
                     </div>
                   </div>
                 </div>
               )})}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default EvidenceGallery;

