import React, { useEffect, useState } from "react";

const createEmptySubjectName = () => ({ value: "" });

const TeacherRecordModal = ({
  teacher,
  saving = false,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState({
    accountId: "",
    name: "",
    email: "",
    subjects: [createEmptySubjectName()]
  });

  useEffect(() => {
    setFormData({
      accountId: teacher?.id || "",
      name: teacher?.name || "",
      email: teacher?.email || "",
      subjects: teacher?.subjects?.length
        ? teacher.subjects.map((subject) => ({ value: subject }))
        : [createEmptySubjectName()]
    });
  }, [teacher]);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      accountId: formData.accountId,
      name: formData.name,
      email: formData.email,
      subjects: formData.subjects.map((subject) => subject.value).filter(Boolean)
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content teacher-modal">
        <div className="panel-header">
          <h3>{teacher?.id ? `Edit Teacher: ${teacher.name}` : "Add Teacher"}</h3>
          <span className="meta-badge">{teacher?.id ? "Edit" : "New"}</span>
        </div>

        <form onSubmit={handleSubmit}>
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
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TeacherRecordModal;
