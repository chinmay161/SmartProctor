import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const EvidenceGallery = ({ evidenceData, onClose }) => {
  const [filterStudent, setFilterStudent] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  
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
              {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
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
               {filteredViolations.map(v => (
                 <div key={v.id} className="bg-card border border-border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                   <div className="h-48 bg-black flex items-center justify-center relative group">
                      <img 
                        src={import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${v.evidence_file}` : v.evidence_file} 
                        alt={v.type}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                         <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded shadow-sm ${v.severity === 'severe' ? 'bg-destructive/90 text-white' : v.severity === 'major' ? 'bg-warning/90 text-white' : 'bg-primary/90 text-white'}`}>
                           {v.severity}
                         </span>
                      </div>
                   </div>
                   <div className="p-3">
                     <h3 className="font-semibold text-sm truncate" title={v.student_name}>{v.student_name}</h3>
                     <div className="flex justify-between items-center mt-1">
                       <span className="text-xs font-medium text-muted-foreground capitalize">{v.type || 'Unknown'}</span>
                       <span className="text-[10px] text-muted-foreground">{v.timestamp ? new Date(v.timestamp).toLocaleString() : ''}</span>
                     </div>
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default EvidenceGallery;
