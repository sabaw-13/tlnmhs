import React, { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

const DEFAULT_GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];

const buildInitialFormState = ({
  student,
  defaultClassId = "",
  defaultTeacherId = "",
  defaultTeacherName = "",
  defaultGradeLevel = ""
}) => ({
  name: student?.name || "",
  email: student?.email || "",
  studentNumber: student?.studentNumber || student?.raw?.studentNumber || "",
  gradeLevel: student?.gradeLevel || student?.raw?.gradeLevel || defaultGradeLevel,
  classId: student?.classId || defaultClassId,
  teacherId: student?.raw?.teacherId || defaultTeacherId,
  teacherName: student?.teacherName || defaultTeacherName,
  gpa: student?.gpa ?? "",
  attendance: student?.attendanceRate ?? "",
  performanceStatus: student?.performanceStatus || "On Track",
  teacherRemarks: student?.teacherRemarks || "",
  subjects: student?.subjects || []
});

const normalizeStudentFormState = (formState) => ({
  name: formState.name.trim(),
  email: formState.email.trim(),
  studentNumber: formState.studentNumber.trim(),
  gradeLevel: formState.gradeLevel,
  classId: formState.classId,
  teacherId: formState.teacherId,
  teacherName: formState.teacherName.trim(),
  gpa: `${formState.gpa}`.trim(),
  attendance: `${formState.attendance}`.trim(),
  performanceStatus: formState.performanceStatus,
  teacherRemarks: formState.teacherRemarks.trim(),
  subjects: formState.subjects
});

const StudentRecordModal = ({
  title,
  student,
  classOptions = [],
  teacherOptions = [],
  gradeLevelOptions = DEFAULT_GRADE_LEVEL_OPTIONS,
  defaultClassId = "",
  defaultTeacherId = "",
  defaultTeacherName = "",
  defaultGradeLevel = "",
  showClassSelector = false,
  showGradeLevelSelector = false,
  allowTeacherSelection = false,
  lockIdentityFields = false,
  requireAccountFields = true,
  accountFieldsOnly = false,
  showAcademicFields = true,
  showAccountActions = false,
  deleting = false,
  saving = false,
  submitLabel = "Save Student",
  onClose,
  onResetPassword,
  onDelete,
  onSubmit
}) => {
  const [formData, setFormData] = useState(() => buildInitialFormState({
    student,
    defaultClassId,
    defaultTeacherId,
    defaultTeacherName,
    defaultGradeLevel
  }));
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    setFormData(buildInitialFormState({
      student,
      defaultClassId,
      defaultTeacherId,
      defaultTeacherName,
      defaultGradeLevel
    }));
    setConfirmState(null);
  }, [student, defaultClassId, defaultTeacherId, defaultTeacherName, defaultGradeLevel]);

  const initialFormState = buildInitialFormState({
    student,
    defaultClassId,
    defaultTeacherId,
    defaultTeacherName,
    defaultGradeLevel
  });

  const hasUnsavedChanges = JSON.stringify(normalizeStudentFormState(formData))
    !== JSON.stringify(normalizeStudentFormState(initialFormState));
  const canEditAcademicFields = !accountFieldsOnly && showAcademicFields;
  const canManageAccount = Boolean(student && showAccountActions);

  const handleSubmitRequest = async (event) => {
    event.preventDefault();
    await onSubmit(formData);
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

    setConfirmState(null);
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
                placeholder="Last name, First name M."
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
                required={requireAccountFields && !student}
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
                required={requireAccountFields && !student}
              />
            </div>

            {showClassSelector && (
              <div className="form-group">
                <label>Section</label>
                <select
                  value={formData.classId}
                  onChange={(event) => {
                    const selectedClass = classOptions.find((classroom) => classroom.id === event.target.value) || null;

                    setFormData({
                      ...formData,
                      classId: event.target.value,
                      gradeLevel: selectedClass?.gradeLevel || formData.gradeLevel
                    });
                  }}
                  required
                >
                  <option value="">Select section</option>
                  {classOptions.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name || classroom.section || classroom.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {showGradeLevelSelector && (
              <div className="form-group">
                <label>Grade Level</label>
                <select
                  value={formData.gradeLevel}
                  onChange={(event) => setFormData({ ...formData, gradeLevel: event.target.value })}
                  required
                >
                  <option value="">Select grade</option>
                  {gradeLevelOptions.map((gradeLevel) => (
                    <option key={gradeLevel} value={gradeLevel}>
                      {gradeLevel}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!accountFieldsOnly && (
              allowTeacherSelection ? (
                <div className="form-group">
                  <label>Teacher</label>
                  <select
                    value={formData.teacherId}
                    onChange={(event) => setFormData({ ...formData, teacherId: event.target.value })}
                  >
                    <option value="">Use section adviser</option>
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
              )
            )}
          </div>

          {canEditAcademicFields && (
            <>
              <div className="form-group">
                <label>Teacher Remarks</label>
                <textarea
                  value={formData.teacherRemarks}
                  onChange={(event) => setFormData({ ...formData, teacherRemarks: event.target.value })}
                  rows="3"
                  placeholder="Add a short academic note"
                />
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="submit" className="primary-btn">
              {saving ? "Saving..." : submitLabel}
            </button>
            {canManageAccount && (
              <>
                <button type="button" className="secondary-btn" onClick={onResetPassword}>
                  Reset Password
                </button>
                <button type="button" className="secondary-btn" disabled={deleting} onClick={onDelete}>
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
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
