import React, { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

export const createEmptySubject = () => ({
  id: "",
  name: "",
  teacher: "",
  q1: "",
  q2: "",
  q3: "",
  q4: ""
});

const buildInitialFormState = ({
  student,
  defaultClassId = "",
  defaultTeacherId = "",
  defaultTeacherName = ""
}) => ({
  name: student?.name || "",
  email: student?.email || "",
  studentNumber: student?.studentNumber || student?.raw?.studentNumber || "",
  parentName: student?.parentName || "",
  parentId: student?.parentId || "",
  classId: student?.classId || defaultClassId,
  teacherId: student?.raw?.teacherId || defaultTeacherId,
  teacherName: student?.teacherName || defaultTeacherName,
  gpa: student?.gpa ?? "",
  attendance: student?.attendanceRate ?? "",
  performanceStatus: student?.performanceStatus || "On Track",
  teacherRemarks: student?.teacherRemarks || "",
  subjects: student?.subjects?.length
    ? student.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      teacher: subject.teacher,
      q1: subject.q1 ?? "",
      q2: subject.q2 ?? "",
      q3: subject.q3 ?? "",
      q4: subject.q4 ?? ""
    }))
    : [createEmptySubject()]
});

const normalizeStudentFormState = (formState) => ({
  name: formState.name.trim(),
  email: formState.email.trim(),
  studentNumber: formState.studentNumber.trim(),
  parentName: formState.parentName.trim(),
  parentId: formState.parentId.trim(),
  classId: formState.classId,
  teacherId: formState.teacherId,
  teacherName: formState.teacherName.trim(),
  gpa: `${formState.gpa}`.trim(),
  attendance: `${formState.attendance}`.trim(),
  performanceStatus: formState.performanceStatus,
  teacherRemarks: formState.teacherRemarks.trim(),
  subjects: formState.subjects
    .map((subject) => ({
      id: subject.id.trim(),
      name: subject.name.trim(),
      teacher: subject.teacher.trim(),
      q1: `${subject.q1}`.trim(),
      q2: `${subject.q2}`.trim(),
      q3: `${subject.q3}`.trim(),
      q4: `${subject.q4}`.trim()
    }))
    .filter((subject) => Object.values(subject).some(Boolean))
});

const StudentRecordModal = ({
  title,
  student,
  classOptions = [],
  teacherOptions = [],
  defaultClassId = "",
  defaultTeacherId = "",
  defaultTeacherName = "",
  showClassSelector = false,
  allowTeacherSelection = false,
  lockIdentityFields = false,
  saving = false,
  submitLabel = "Save Student",
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState(() => buildInitialFormState({
    student,
    defaultClassId,
    defaultTeacherId,
    defaultTeacherName
  }));
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    setFormData(buildInitialFormState({
      student,
      defaultClassId,
      defaultTeacherId,
      defaultTeacherName
    }));
    setConfirmState(null);
  }, [student, defaultClassId, defaultTeacherId, defaultTeacherName]);

  const initialFormState = buildInitialFormState({
    student,
    defaultClassId,
    defaultTeacherId,
    defaultTeacherName
  });

  const hasUnsavedChanges = JSON.stringify(normalizeStudentFormState(formData))
    !== JSON.stringify(normalizeStudentFormState(initialFormState));

  const updateSubjectField = (index, field, value) => {
    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) => (
        subjectIndex === index ? { ...subject, [field]: value } : subject
      ))
    }));
  };

  const addSubjectRow = () => {
    setFormData((previous) => ({
      ...previous,
      subjects: [...previous.subjects, createEmptySubject()]
    }));
  };

  const removeSubjectRow = (index) => {
    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.filter((_, subjectIndex) => subjectIndex !== index)
    }));
  };

  const handleSubmitRequest = (event) => {
    event.preventDefault();
    setConfirmState({
      tone: "info",
      title: student ? "Save student updates?" : "Add this student now?",
      message: student
        ? "The class record, subjects, and summary details will be updated after you confirm."
        : "This student will be added to the selected class, a student account will be created, and the ID number will be used as the first password."
    });
  };

  const handleCloseRequest = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    setConfirmState({
      tone: "warning",
      title: "Discard your changes?",
      message: "Your unsaved edits will be lost if you leave this form now.",
      confirmLabel: "Discard Changes",
      cancelLabel: "Keep Editing",
      action: "discard"
    });
  };

  const handleConfirmAction = async () => {
    if (confirmState?.action === "discard") {
      setConfirmState(null);
      onClose();
      return;
    }

    try {
      await onSubmit(formData);
    } finally {
      setConfirmState(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="panel-header">
          <h3>{title}</h3>
          <span className="meta-badge">{student ? "Edit" : "New"}</span>
        </div>
        <form onSubmit={handleSubmitRequest}>
          <div className="modal-form-grid">
            <div className="form-group">
              <label>Student Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Enter student name"
                disabled={lockIdentityFields}
                required
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                placeholder="student@email.com"
                disabled={lockIdentityFields}
                required={!student}
              />
            </div>

            <div className="form-group">
              <label>Student ID Number</label>
              <input
                type="text"
                value={formData.studentNumber}
                onChange={(event) => setFormData({ ...formData, studentNumber: event.target.value })}
                placeholder="Used as the default password"
                disabled={lockIdentityFields}
                required={!student}
              />
            </div>

            <div className="form-group">
              <label>Parent Name</label>
              <input
                type="text"
                value={formData.parentName}
                onChange={(event) => setFormData({ ...formData, parentName: event.target.value })}
                placeholder="Parent or guardian"
                disabled={lockIdentityFields}
              />
            </div>

            <div className="form-group">
              <label>Parent ID</label>
              <input
                type="text"
                value={formData.parentId}
                onChange={(event) => setFormData({ ...formData, parentId: event.target.value })}
                placeholder="Linked parent UID"
                disabled={lockIdentityFields}
              />
            </div>

            {showClassSelector && (
              <div className="form-group">
                <label>Class</label>
                <select
                  value={formData.classId}
                  onChange={(event) => setFormData({ ...formData, classId: event.target.value })}
                  required
                >
                  <option value="">Select class</option>
                  {classOptions.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name || classroom.section || classroom.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {allowTeacherSelection ? (
              <div className="form-group">
                <label>Teacher</label>
                <select
                  value={formData.teacherId}
                  onChange={(event) => setFormData({ ...formData, teacherId: event.target.value })}
                >
                  <option value="">Use class teacher</option>
                  {teacherOptions.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Teacher</label>
                <input type="text" value={formData.teacherName || defaultTeacherName || "Assigned Teacher"} disabled />
              </div>
            )}

            <div className="form-group">
              <label>Overall Average</label>
              <input
                type="number"
                step="0.01"
                value={formData.gpa}
                onChange={(event) => setFormData({ ...formData, gpa: event.target.value })}
                placeholder="Auto-computed if blank"
              />
            </div>

            <div className="form-group">
              <label>Attendance (%)</label>
              <input
                type="number"
                value={formData.attendance}
                onChange={(event) => setFormData({ ...formData, attendance: event.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="form-group form-group-full">
              <label>Performance Status</label>
              <select
                value={formData.performanceStatus}
                onChange={(event) => setFormData({ ...formData, performanceStatus: event.target.value })}
              >
                <option value="Excellent">Excellent</option>
                <option value="On Track">On Track</option>
                <option value="Needs Support">Needs Support</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Teacher Remarks</label>
            <textarea
              value={formData.teacherRemarks}
              onChange={(event) => setFormData({ ...formData, teacherRemarks: event.target.value })}
              rows="3"
              placeholder="Add a short academic note"
            />
          </div>

          <div className="subject-editor">
            <div className="panel-header">
              <h4>Subject Grades</h4>
              <button type="button" className="secondary-btn" onClick={addSubjectRow}>Add Subject</button>
            </div>
            {formData.subjects.map((subject, index) => (
              <div key={`${subject.id || "subject"}-${index}`} className="subject-grid">
                <input
                  type="text"
                  value={subject.name}
                  placeholder="Subject"
                  onChange={(event) => updateSubjectField(index, "name", event.target.value)}
                />
                <input
                  type="text"
                  value={subject.teacher}
                  placeholder="Teacher"
                  onChange={(event) => updateSubjectField(index, "teacher", event.target.value)}
                />
                <input
                  type="number"
                  value={subject.q1}
                  placeholder="Q1"
                  onChange={(event) => updateSubjectField(index, "q1", event.target.value)}
                />
                <input
                  type="number"
                  value={subject.q2}
                  placeholder="Q2"
                  onChange={(event) => updateSubjectField(index, "q2", event.target.value)}
                />
                <input
                  type="number"
                  value={subject.q3}
                  placeholder="Q3"
                  onChange={(event) => updateSubjectField(index, "q3", event.target.value)}
                />
                <input
                  type="number"
                  value={subject.q4}
                  placeholder="Q4"
                  onChange={(event) => updateSubjectField(index, "q4", event.target.value)}
                />
                {formData.subjects.length > 1 && (
                  <button type="button" className="text-btn" onClick={() => removeSubjectRow(index)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-btn">
              {saving ? "Saving..." : submitLabel}
            </button>
            <button type="button" className="secondary-btn" onClick={handleCloseRequest}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {confirmState && (
        <ConfirmDialog
          tone={confirmState.tone}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel || (student ? "Save Changes" : "Add Student")}
          cancelLabel={confirmState.cancelLabel || "Go Back"}
          busy={saving}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};

export default StudentRecordModal;
