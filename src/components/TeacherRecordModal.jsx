import React, { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

const createEmptySubjectName = () => ({ value: "" });

const buildTeacherFormState = (teacher) => ({
  accountId: teacher?.id || "",
  name: teacher?.name || "",
  email: teacher?.email || "",
  subjects: teacher?.subjects?.length
    ? teacher.subjects.map((subject) => ({ value: subject }))
    : [createEmptySubjectName()]
});

const normalizeTeacherFormState = (formState) => ({
  accountId: formState.accountId.trim(),
  name: formState.name.trim(),
  email: formState.email.trim(),
  subjects: formState.subjects
    .map((subject) => subject.value.trim())
    .filter(Boolean)
});

const TeacherRecordModal = ({
  teacher,
  saving = false,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState(() => buildTeacherFormState(teacher));
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    setFormData(buildTeacherFormState(teacher));
    setConfirmState(null);
  }, [teacher]);

  const initialFormState = buildTeacherFormState(teacher);
  const hasUnsavedChanges = JSON.stringify(normalizeTeacherFormState(formData))
    !== JSON.stringify(normalizeTeacherFormState(initialFormState));

  const updateSubject = (index, value) => {
    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) => (
        subjectIndex === index ? { value } : subject
      ))
    }));
  };

  const addSubject = () => {
    setFormData((previous) => ({
      ...previous,
      subjects: [...previous.subjects, createEmptySubjectName()]
    }));
  };

  const removeSubject = (index) => {
    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.filter((_, subjectIndex) => subjectIndex !== index)
    }));
  };

  const handleSubmitRequest = (event) => {
    event.preventDefault();
    setConfirmState({
      tone: "info",
      title: teacher?.id ? "Save teacher updates?" : "Add this teacher now?",
      message: teacher?.id
        ? "The teacher profile and assigned subjects will be updated after you confirm."
        : "This teacher record and subject load will be added to the repository."
    });
  };

  const handleCloseRequest = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    setConfirmState({
      tone: "warning",
      title: "Discard teacher changes?",
      message: "Your unsaved teacher details and subject edits will be lost.",
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
      await onSubmit({
        accountId: formData.accountId,
        name: formData.name,
        email: formData.email,
        subjects: formData.subjects.map((subject) => subject.value).filter(Boolean)
      });
    } finally {
      setConfirmState(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content teacher-modal">
        <div className="panel-header">
          <h3>{teacher?.id ? `Edit Teacher: ${teacher.name}` : "Add Teacher"}</h3>
          <span className="meta-badge">{teacher?.id ? "Edit" : "New"}</span>
        </div>

        <form onSubmit={handleSubmitRequest}>
          <div className="modal-form-grid">
            <div className="form-group">
              <label>Teacher Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Enter teacher name"
                required
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                placeholder="teacher@email.com"
              />
            </div>

            <div className="form-group form-group-full">
              <label>Teacher UID / Account ID</label>
              <input
                type="text"
                value={formData.accountId}
                onChange={(event) => setFormData({ ...formData, accountId: event.target.value })}
                placeholder="Optional: use existing Firebase Auth UID"
                disabled={Boolean(teacher?.id)}
              />
            </div>
          </div>

          <div className="subject-editor">
            <div className="panel-header">
              <h4>Assigned Subjects</h4>
              <button type="button" className="secondary-btn" onClick={addSubject}>Add Subject</button>
            </div>
            {formData.subjects.map((subject, index) => (
              <div key={`teacher-subject-${index}`} className="subject-grid teacher-subject-grid">
                <input
                  type="text"
                  value={subject.value}
                  placeholder="Subject name"
                  onChange={(event) => updateSubject(index, event.target.value)}
                />
                {formData.subjects.length > 1 && (
                  <button type="button" className="text-btn" onClick={() => removeSubject(index)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-btn">
              {saving ? "Saving..." : teacher?.id ? "Save Teacher" : "Add Teacher"}
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
          confirmLabel={confirmState.confirmLabel || (teacher?.id ? "Save Teacher" : "Add Teacher")}
          cancelLabel={confirmState.cancelLabel || "Go Back"}
          busy={saving}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};

export default TeacherRecordModal;
