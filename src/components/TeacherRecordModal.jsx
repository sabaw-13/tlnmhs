import React, { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

const buildSubjectKey = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const getSubjectStorageKey = (subject) => buildSubjectKey(
  subject?.code || subject?.subjectCode || subject?.name || subject?.subject || subject || ""
);

const createEmptySubjectName = () => ({ code: "", name: "", classIds: [] });
const normalizeTeacherSubjectRecord = (subject, subjectClassIds = {}) => {
  const name = typeof subject === "string"
    ? String(subject).trim()
    : String(subject?.name || subject?.subject || "").trim();
  const code = typeof subject === "string"
    ? ""
    : String(subject?.code || subject?.subjectCode || "").trim().toUpperCase();
  const assignedClassIds = Object.entries(
    subjectClassIds?.[getSubjectStorageKey(subject)]
    || (!code ? subjectClassIds?.[buildSubjectKey(name)] : null)
    || {}
  )
    .filter(([, isSelected]) => Boolean(isSelected))
    .map(([classId]) => classId);

  if (typeof subject === "string") {
    return { code: "", name, classIds: assignedClassIds };
  }

  return {
    code,
    name,
    classIds: assignedClassIds
  };
};

const buildTeacherFormState = (teacher) => ({
  accountId: teacher?.id || "",
  name: teacher?.name || "",
  email: teacher?.email || "",
  password: "",
  advisoryClassId: teacher?.advisoryClassId || "",
  subjects: (teacher?.subjectRecords?.length
    ? teacher.subjectRecords
    : teacher?.subjects?.length
      ? teacher.subjects
      : []).length
    ? (teacher?.subjectRecords?.length ? teacher.subjectRecords : teacher.subjects)
      .map((subject) => normalizeTeacherSubjectRecord(subject, teacher?.subjectClassIds || {}))
    : [createEmptySubjectName()]
});

const normalizeTeacherFormState = (formState) => ({
  accountId: formState.accountId.trim(),
  name: formState.name.trim(),
  email: formState.email.trim(),
  password: formState.password.trim(),
  advisoryClassId: formState.advisoryClassId,
  subjects: formState.subjects
    .map((subject) => ({
      code: subject.code.trim().toUpperCase(),
      name: subject.name.trim(),
      classIds: Array.isArray(subject.classIds) ? [...new Set(subject.classIds)] : []
    }))
    .filter((subject) => subject.code || subject.name)
});

const TeacherRecordModal = ({
  teacher,
  classOptions = [],
  subjectClassOptions = [],
  gradeLevelOptions = [],
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

  const updateSubject = (index, field, value) => {
    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) => (
        subjectIndex === index ? { ...subject, [field]: field === "code" ? value.toUpperCase() : value } : subject
      ))
    }));
  };

  const toggleSubjectClass = (index, classId) => {
    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) => {
        if (subjectIndex !== index) return subject;

        const classIds = subject.classIds.includes(classId)
          ? subject.classIds.filter((currentClassId) => currentClassId !== classId)
          : [...subject.classIds, classId];

        return { ...subject, classIds };
      })
    }));
  };

  const assignGradeLevelToSubject = (index, gradeLevel) => {
    const normalizedGradeLevel = String(gradeLevel || "").trim();
    const matchingClassIds = normalizedGradeLevel
      ? subjectClassOptions
        .filter((classroom) => classroom.gradeLevel === normalizedGradeLevel)
        .map((classroom) => classroom.id)
      : [];

    setFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) => (
        subjectIndex === index ? { ...subject, classIds: matchingClassIds } : subject
      ))
    }));
  };

  const getSelectedGradeLevel = (classIds = []) => {
    if (!classIds.length) return "";

    const selectedClasses = subjectClassOptions.filter((classroom) => classIds.includes(classroom.id));
    const selectedGradeLevels = [...new Set(selectedClasses.map((classroom) => classroom.gradeLevel).filter(Boolean))];
    if (selectedGradeLevels.length !== 1) return "";

    const [gradeLevel] = selectedGradeLevels;
    const gradeLevelClassIds = subjectClassOptions
      .filter((classroom) => classroom.gradeLevel === gradeLevel)
      .map((classroom) => classroom.id)
      .sort();
    const normalizedSelectedIds = [...classIds].sort();

    return gradeLevelClassIds.length === normalizedSelectedIds.length
      && gradeLevelClassIds.every((classId, index) => classId === normalizedSelectedIds[index])
      ? gradeLevel
      : "";
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

  const handleSubmitRequest = async (event) => {
    event.preventDefault();
    await onSubmit({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      advisoryClassId: formData.advisoryClassId,
      subjects: formData.subjects
        .map((subject) => ({
          code: subject.code.trim().toUpperCase(),
          name: subject.name.trim(),
          classIds: Array.isArray(subject.classIds) ? [...new Set(subject.classIds)] : []
        }))
        .filter((subject) => subject.code || subject.name)
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

    setConfirmState(null);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content teacher-modal">
        <div className="panel-header">
          <h3>{teacher?.id ? `Edit Teacher: ${teacher.name}` : "Add Teacher"}</h3>
          {teacher?.id && <span className="meta-badge">Edit</span>}
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
                required
              />
            </div>

            {!teacher?.id && (
              <div className="form-group form-group-full">
                <label>Initial Password</label>
                <input
                  type="text"
                  minLength="6"
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  placeholder="At least 6 characters"
                  required
                />
              </div>
            )}

            <div className="form-group form-group-full">
              <label>Advisory Section</label>
              <select
                value={formData.advisoryClassId}
                onChange={(event) => setFormData({ ...formData, advisoryClassId: event.target.value })}
              >
                <option value="">No Advisory</option>
                {classOptions.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name || classroom.section || classroom.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {teacher?.id && (
            <div className="subject-editor">
              <div className="panel-header">
                <h4>Assigned Subjects</h4>
                <button type="button" className="secondary-btn" onClick={addSubject}>Add Subject</button>
              </div>
              {formData.subjects.map((subject, index) => (
                <div key={`teacher-subject-${index}`} className="subject-grid teacher-subject-grid">
                  <input
                    type="text"
                    value={subject.code}
                    placeholder="Subject code"
                    onChange={(event) => updateSubject(index, "code", event.target.value)}
                  />
                  <input
                    type="text"
                    value={subject.name}
                    placeholder="Subject name"
                    onChange={(event) => updateSubject(index, "name", event.target.value)}
                  />
                  <div className="teacher-subject-assignment">
                    <div className="teacher-subject-assignment-header">
                      <strong>Assign Grade Level or Section</strong>
                      <span className="meta-badge">{subject.classIds.length} selected</span>
                    </div>
                    <div className="teacher-subject-assignment-controls">
                      <label className="form-group">
                        <span>Quick Grade Level</span>
                        <select
                          value={getSelectedGradeLevel(subject.classIds)}
                          onChange={(event) => assignGradeLevelToSubject(index, event.target.value)}
                        >
                          <option value="">Choose grade level</option>
                          {gradeLevelOptions.map((gradeLevel) => (
                            <option key={`${subject.code || subject.name || index}-${gradeLevel}`} value={gradeLevel}>
                              {gradeLevel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => assignGradeLevelToSubject(index, "")}
                      >
                        Clear Sections
                      </button>
                    </div>
                    <div className="class-checkbox-grid">
                      {subjectClassOptions.map((classroom) => {
                        const classLabel = classroom.name || classroom.section || classroom.id;
                        const classMeta = [classroom.gradeLevel, classLabel].filter(Boolean).join(" - ");

                        return (
                          <label key={`${subject.code || subject.name || index}-${classroom.id}`} className="class-checkbox">
                            <input
                              type="checkbox"
                              checked={subject.classIds.includes(classroom.id)}
                              onChange={() => toggleSubjectClass(index, classroom.id)}
                            />
                            <span>{classMeta}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {formData.subjects.length > 1 && (
                    <button type="button" className="text-btn" onClick={() => removeSubject(index)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

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
