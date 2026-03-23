from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.exam_session import ExamSession
from ..models.exam_attempt import ExamAttempt
from ..models.violation import Violation
from ..models.user_profile import UserProfile
import io
import csv


def _display_name_for_profile(profile: UserProfile | None, fallback: str) -> str:
    if not profile:
        return fallback
    return profile.email or profile.auth0_sub or fallback


def _risk_bucket(score: int) -> str:
    if score > 80:
        return "SAFE"
    if score >= 50:
        return "SUSPICIOUS"
    return "HIGH_RISK"


def get_exam_analytics(db: Session, exam_id: str):
    sessions = db.query(ExamSession).filter_by(exam_id=exam_id).all()
    if not sessions:
        return {
            "total_students": 0,
            "completed": 0,
            "auto_submitted": 0,
            "avg_score": 0,
            "avg_trust_score": 100,
            "violation_analytics": {},
            "risk_distribution": {"SAFE": 0, "SUSPICIOUS": 0, "HIGH_RISK": 0},
            "students": []
        }
    
    total_students = len(sessions)
    completed = 0
    auto_submitted = 0
    total_score = 0
    total_trust = 0
    
    violation_counts = {}
    risk_distribution = {"SAFE": 0, "SUSPICIOUS": 0, "HIGH_RISK": 0}
    students_data = []
    
    for s in sessions:
        uid = s.student_id
        user = db.query(UserProfile).filter_by(auth0_sub=uid).first()
        name = _display_name_for_profile(user, uid)
        
        attempt = db.query(ExamAttempt).filter_by(id=s.attempt_id).first() if s.attempt_id else None
        
        score = attempt.score if attempt and attempt.score is not None else 0
        trust_score = attempt.integrity_score if attempt else 100
        risk = _risk_bucket(trust_score)
            
        risk_distribution[risk] += 1
        
        status = str(s.status or "").upper()
        if status == "ENDED":
            completed += 1
        elif bool(s.auto_terminated):
            auto_submitted += 1
            
        total_score += score
        total_trust += trust_score
        
        v_count = db.query(Violation).filter_by(session_id=s.id).count()
        
        final_score = (score * 0.7) + (trust_score * 0.3)
        
        students_data.append({
            "attempt_id": s.attempt_id,
            "session_id": s.id,
            "student_id": uid,
            "name": name,
            "score": score,
            "trust_score": trust_score,
            "violations": v_count,
            "risk_level": risk,
            "final_score": round(final_score, 2),
            "status": status
        })
        
        violations = db.query(Violation).filter_by(session_id=s.id).all()
        for v in violations:
            v_type = v.type or "UNKNOWN"
            violation_counts[v_type] = violation_counts.get(v_type, 0) + 1
            
    students_data.sort(key=lambda x: x["final_score"], reverse=True)
            
    return {
        "total_students": total_students,
        "completed": completed,
        "auto_submitted": auto_submitted,
        "avg_score": round(total_score / total_students, 2) if total_students else 0,
        "avg_trust_score": round(total_trust / total_students, 2) if total_students else 100,
        "violation_analytics": violation_counts,
        "risk_distribution": risk_distribution,
        "students": students_data
    }

def generate_csv_export(db: Session, exam_id: str):
    data = get_exam_analytics(db, exam_id)
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["Name", "Student ID", "Score", "Trust Score", "Violations", "Risk Level", "Final Score", "Status"])
    for s in data["students"]:
        writer.writerow([s["name"], s["student_id"], s["score"], s["trust_score"], s["violations"], s["risk_level"], s["final_score"], s["status"]])
        
    return output.getvalue()

def generate_pdf_export(db: Session, exam_id: str):
    data = get_exam_analytics(db, exam_id)
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    elements.append(Paragraph(f"Exam Proctoring Report", styles['Title']))
    elements.append(Paragraph(f"Exam ID: {exam_id}", styles['Normal']))
    elements.append(Spacer(1, 12))
    
    elements.append(Paragraph("Overview", styles['Heading2']))
    elements.append(Paragraph(f"Total Students: {data['total_students']}", styles['Normal']))
    elements.append(Paragraph(f"Completed: {data['completed']}", styles['Normal']))
    elements.append(Paragraph(f"Auto-Submitted / Terminated: {data['auto_submitted']}", styles['Normal']))
    elements.append(Paragraph(f"Average Score: {data['avg_score']}", styles['Normal']))
    elements.append(Paragraph(f"Average Trust Score: {data['avg_trust_score']}", styles['Normal']))
    elements.append(Spacer(1, 12))
    
    elements.append(Paragraph("Risk Distribution", styles['Heading2']))
    for k, v in data['risk_distribution'].items():
        elements.append(Paragraph(f"{k}: {v}", styles['Normal']))
    elements.append(Spacer(1, 12))
    
    elements.append(Paragraph("Student Rankings", styles['Heading2']))
    table_data = [["Name", "Score", "Trust", "Violations", "Risk", "Final"]]
    for s in data["students"]:
        table_data.append([
            str(s["name"])[:15], 
            str(s["score"]), 
            str(s["trust_score"]), 
            str(s["violations"]), 
            str(s["risk_level"]), 
            str(s["final_score"])
        ])
        
    t = Table(table_data)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.grey),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 12),
        ('BACKGROUND', (0,1), (-1,-1), colors.beige),
        ('GRID', (0,0), (-1,-1), 1, colors.black)
    ]))
    elements.append(t)
    elements.append(Spacer(1, 24))

    # Part 7: Export Upgrade - Include Timeline Logs
    elements.append(Paragraph("Exam Timeline Logs", styles['Heading2']))
    from ..models.audit import AuditLog
    # Just show a sample from the first student's session for the report
    if data["students"]:
        sample_session = data["students"][0]["session_id"]
        logs = db.query(AuditLog).filter_by(session_id=sample_session).order_by(AuditLog.timestamp).limit(20).all()
        if logs:
            timeline_data = [["Timestamp", "Event Type", "Event Data"]]
            for log in logs:
                import json
                try: 
                    log_data = json.loads(log.data)
                    data_str = str(log_data)[:80] + "..." if len(str(log_data)) > 80 else str(log_data)
                except:
                    data_str = str(log.data)
                time_str = log.timestamp.strftime("%Y-%m-%d %H:%M:%S") if log.timestamp else "N/A"
                timeline_data.append([time_str, str(log.event_type), data_str])
            
            t2 = Table(timeline_data, colWidths=[120, 150, 250])
            t2.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#2C3E50")),
                ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0,0), (-1,0), 8),
                ('GRID', (0,0), (-1,-1), 0.5, colors.grey)
            ]))
            elements.append(t2)
        else:
            elements.append(Paragraph("No audit timeline events found for sample session.", styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer

def get_exam_evidence(db: Session, exam_id: str):
    sessions = db.query(ExamSession).filter_by(exam_id=exam_id).all()
    evidence_data = []
    
    for s in sessions:
        uid = s.student_id
        user = db.query(UserProfile).filter_by(auth0_sub=uid).first()
        name = _display_name_for_profile(user, uid)
        
        violations = db.query(Violation).filter_by(session_id=s.id).all()
        student_violations = []
        for v in violations:
            if v.evidence_files:
                student_violations.append({
                    "id": str(v.id),
                    "type": v.type or "UNKNOWN",
                    "severity": v.severity,
                    "evidence_file": v.evidence_files,
                    "timestamp": v.timestamp.isoformat() if v.timestamp else None
                })
        
        if student_violations:
            evidence_data.append({
                "session_id": str(s.id),
                "student_id": uid,
                "name": name,
                "violations": sorted(student_violations, key=lambda x: x["timestamp"] or "", reverse=True)
            })
            
    return evidence_data
