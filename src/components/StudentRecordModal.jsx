import React, { useEffect, useState } from "react";

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

  useEffect(() => {
    setFormData(buildInitialFormState({
      student,
      defaultClassId,
      defaultTeacherId,
      defaultTeacherName
    }));
  }, [student, defaultClassId, defaultTeacherId, defaultTeacherName]);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="panel-header">
          <h3>{title}</h3>
          <span className="meta-badge">{student ? "Edit" : "New"}</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-form-grid">
            <div className="form-group">
              <label>Student Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Enter student name"
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
              />
            </div>

            <div className="form-group">
              <label>Parent Name</label>
              <input
                type="text"
                value={formData.parentName}
                onChange={(event) => setFormData({ ...formData, parentName: event.target.value })}
                placeholder="Parent or guardian"
              />
            </div>

            <div className="form-group">
              <label>Parent ID</label>
              <input
                type="text"
                value={formData.parentId}
                onChange={(event) => setFormData({ ...formData, parentId: event.target.value })}
                placeholder="Linked parent UID"
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
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentRecordModal;
