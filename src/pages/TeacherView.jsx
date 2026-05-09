import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { formatShortDate } from "../utils/reporting";
import ConfirmDialog from "../components/ConfirmDialog";
import StudentRecordModal from "../components/StudentRecordModal";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");
const ATTENDANCE_STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" }
];
const ATTENDED_STATUSES = new Set(["present", "late", "excused"]);

const getLocalDateValue = () => {
  const date = new Date();
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const formatDateLabel = (dateValue) => {
  if (!dateValue) return "Selected date";

  return formatShortDate(`${dateValue}T00:00:00`);
};

const buildSubjectKey = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const normalizeScoreArray = (value) => {
  if (Array.isArray(value)) return value.map((score) => (score ?? "")).map(String);
  if (value === null || value === undefined || value === "") return [""];
  return [String(value)];
};

const hasScoreValue = (value) => String(value ?? "").trim() !== "";

const TeacherView = ({ section = "overview" }) => {
  const { userData, currentUser } = useAuth();
  const {
    error,
    loading,
    savingStudentId,
    savingTeacherId,
    savingAttendanceKey,
    classReports,
    teacherClassReports,
    teacherUsers,
    students: allStudents = [],
    approveClassJoinRequest,
    rejectClassJoinRequest,
    getAttendanceRecord,
    savingEnrollmentStudentId,
    addStudentToClass,
    saveDailyAttendanceRecord,
    saveStudentRecord,
    saveTeacherSubjects,
    saveTeacherSubjectClasses,
    saveSubjectScores
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [managingStudent, setManagingStudent] = useState(null);
  const [addingStudentToClass, setAddingStudentToClass] = useState(false);
  const [studentToAddId, setStudentToAddId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(getLocalDateValue);
  const [dailyAttendanceDrafts, setDailyAttendanceDrafts] = useState({});
  const [isNoClassDay, setIsNoClassDay] = useState(false);
  const [noClassReason, setNoClassReason] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectForm, setSubjectForm] = useState({
    name: "",
    classIds: []
  });
  const [subjectClassOverrides, setSubjectClassOverrides] = useState({});
  const [selectedSubjectName, setSelectedSubjectName] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectScoreDrafts, setSubjectScoreDrafts] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const [savingAllSubjectScores, setSavingAllSubjectScores] = useState(false);
  const [assessmentCounts, setAssessmentCounts] = useState({
    activities: 1,
    quizzes: 1,
    exams: 1
  });

  useEffect(() => {
    if (!teacherClassReports.length) {
      setSelectedClassId("");
      return;
    }

    const hasSelectedClass = teacherClassReports.some((classroom) => classroom.id === selectedClassId);
    if (!selectedClassId || !hasSelectedClass) {
      setSelectedClassId(teacherClassReports[0].id);
    }
  }, [teacherClassReports, selectedClassId]);

  const selectedClass = teacherClassReports.find((classroom) => classroom.id === selectedClassId) || teacherClassReports[0] || null;
  const students = selectedClass?.students || [];
  const teacherProfile = teacherUsers.find((teacher) => teacher.id === currentUser?.uid) || null;
  const pendingJoinRequests = Object.values(selectedClass?.joinRequests || {})
    .filter((request) => request?.status === "pending");
  const studentRosterKey = students.map((student) => student.id).join("|");
  const selectedAttendanceRecord = selectedClass ? getAttendanceRecord(selectedClass.id, attendanceDate) : null;

  useEffect(() => {
    setIsNoClassDay(selectedAttendanceRecord?.status === "no-class");
    setNoClassReason(selectedAttendanceRecord?.noClassReason || "");
    setDailyAttendanceDrafts((currentDrafts) => {
      const nextDrafts = {};

      students.forEach((student) => {
        nextDrafts[student.id] = selectedAttendanceRecord
          ? selectedAttendanceRecord.records?.[student.id]?.status || "present"
          : "present";
      });

      if (JSON.stringify(nextDrafts) === JSON.stringify(currentDrafts)) {
        return currentDrafts;
      }

      return nextDrafts;
    });
  }, [attendanceDate, selectedClassId, selectedAttendanceRecord, studentRosterKey]);

  useEffect(() => {
    const subjects = teacherProfile?.subjects?.length ? teacherProfile.subjects : [];
    if (!subjects.length) {
      setSelectedSubjectName("");
      return;
    }

    if (!selectedSubjectName || !subjects.some((subject) => subject === selectedSubjectName)) {
      setSelectedSubjectName(subjects[0]);
    }
  }, [teacherProfile?.subjects?.join("|"), selectedSubjectName]);

  const studentsNeedingSupport = students.filter((student) => student.performanceStatus === "Needs Support");
  const dailyPresentCount = isNoClassDay
    ? 0
    : students.filter((student) => ATTENDED_STATUSES.has(dailyAttendanceDrafts[student.id] || "present")).length;
  const dailyAbsentCount = isNoClassDay
    ? 0
    : students.filter((student) => (dailyAttendanceDrafts[student.id] || "present") === "absent").length;
  const topPerformer = [...students]
    .filter((student) => Number.isFinite(student.gpa))
    .sort((left, right) => right.gpa - left.gpa)[0] || null;
  const recentUpdates = [...students]
    .filter((student) => student.updatedAt || student.recentActivity.length)
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, 5);
  const gradeDistribution = [
    { label: "Excellent", count: students.filter((student) => Number.isFinite(student.gpa) && student.gpa >= 90).length },
    { label: "On Track", count: students.filter((student) => Number.isFinite(student.gpa) && student.gpa >= 80 && student.gpa < 90).length },
    { label: "Needs Support", count: students.filter((student) => !Number.isFinite(student.gpa) || student.gpa < 80).length }
  ];
  const sectionMeta = {
    dashboard: "Teaching Dashboard",
    overview: "Teaching Dashboard",
    requests: "Enrollment Requests",
    students: "Student Manager",
    subjects: "Subjects",
    attendance: "Attendance",
    gradebook: "Gradebook",
    reports: "Reports"
  };
  const isDashboardSection = section === "dashboard" || section === "overview";
  const isClassScopedSection = section !== "subjects";
  const classTeacherName = selectedClass?.teacherName
    || selectedClass?.adviserName
    || userData?.displayName
    || userData?.email
    || currentUser?.email
    || "Assigned Teacher";
  const existingStudentOptions = allStudents
    .filter((student) => {
      if (!student.id || student.classId === selectedClass?.id) return false;
      if (student.classId) return false;
      if (selectedClass?.gradeLevel && student.gradeLevel && student.gradeLevel !== selectedClass.gradeLevel) return false;

      return true;
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const handledSubjects = teacherProfile?.subjects || [];
  const subjectSearchTerm = subjectSearch.trim().toLowerCase();
  const filteredHandledSubjects = handledSubjects.filter((subject) => (
    !subjectSearchTerm || subject.toLowerCase().includes(subjectSearchTerm)
  ));
  const selectedSubjectKey = buildSubjectKey(selectedSubjectName);
  const selectedSubjectClassMap = subjectClassOverrides[selectedSubjectKey]
    || teacherProfile?.subjectClassIds?.[selectedSubjectKey]
    || {};
  const selectedSubjectClassIds = Object.keys(selectedSubjectClassMap).filter((classId) => selectedSubjectClassMap[classId]);
  const selectedSubjectClasses = classReports.filter((classroom) => selectedSubjectClassIds.includes(classroom.id));
  const subjectStudents = allStudents
    .filter((student) => student.id && student.classId && selectedSubjectClassIds.includes(student.classId))
    .sort((left, right) => (
      String(left.className).localeCompare(String(right.className))
      || String(left.name).localeCompare(String(right.name))
    ));
  const subjectStudentGroups = subjectStudents.reduce((groups, student) => {
    const groupName = student.className || "Unassigned Section";
    groups[groupName] = [...(groups[groupName] || []), student];
    return groups;
  }, {});

  const getStudentSubjectRecord = (student, subjectName) => {
    return student.subjects.find((subject) => (
      String(subject.name || "").trim().toLowerCase() === String(subjectName || "").trim().toLowerCase()
    )) || null;
  };
  const subjectAssessmentSignature = subjectStudents.map((student) => {
    const subject = getStudentSubjectRecord(student, selectedSubjectName);

    return [
      subject?.activities?.length || 0,
      subject?.quizzes?.length || 0,
      subject?.exams?.length || 0
    ].join("-");
  }).join("|");

  useEffect(() => {
    if (!selectedSubjectName) return;

    const nextCounts = subjectStudents.reduce((counts, student) => {
      const subject = getStudentSubjectRecord(student, selectedSubjectName);

      return {
        activities: Math.max(counts.activities, subject?.activities?.length || 0),
        quizzes: Math.max(counts.quizzes, subject?.quizzes?.length || 0),
        exams: Math.max(counts.exams, subject?.exams?.length || 0)
      };
    }, { activities: 1, quizzes: 1, exams: 1 });

    setAssessmentCounts(nextCounts);
  }, [selectedSubjectName, subjectAssessmentSignature]);

  const openStudentModal = (student = null) => {
    if (!student?.id) return;

    setManagingStudent(student || {});
    setSaveMessage("");
  };

  const openAddStudentModal = () => {
    setStudentToAddId(existingStudentOptions[0]?.id || "");
    setAddingStudentToClass(true);
    setSaveMessage("");
  };

  const handleDailyAttendanceChange = (studentId, value) => {
    setDailyAttendanceDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: value
    }));
  };

  const openSubjectModal = () => {
    setSubjectForm({
      name: "",
      classIds: []
    });
    setShowSubjectModal(true);
    setSaveMessage("");
  };

  const handleSubjectFormClassToggle = (classId) => {
    setSubjectForm((currentForm) => ({
      ...currentForm,
      classIds: currentForm.classIds.includes(classId)
        ? currentForm.classIds.filter((item) => item !== classId)
        : [...currentForm.classIds, classId]
    }));
  };

  const handleAddSubject = async (event) => {
    event.preventDefault();

    const subjectName = subjectForm.name.trim();
    if (!subjectName) {
      setSaveMessage("Enter a subject name.");
      return;
    }

    try {
      const nextSubjects = [...handledSubjects, subjectName]
        .filter((subject, index, subjects) => (
          subject.trim() && subjects.findIndex((item) => item.trim().toLowerCase() === subject.trim().toLowerCase()) === index
        ));

      await saveTeacherSubjects(nextSubjects);
      const classMap = await saveTeacherSubjectClasses({
        subjectName,
        classIds: subjectForm.classIds,
        subjectNames: nextSubjects
      });
      setSubjectClassOverrides((currentOverrides) => ({
        ...currentOverrides,
        [buildSubjectKey(subjectName)]: classMap
      }));
      setSelectedSubjectName(subjectName);
      setSubjectScoreDrafts({});
      setAssessmentCounts({ activities: 1, quizzes: 1, exams: 1 });
      setShowSubjectModal(false);
      setSaveMessage(`${subjectName} added.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject could not be added.");
    }
  };

  const getSubjectScoreDraft = (student) => {
    const savedSubject = getStudentSubjectRecord(student, selectedSubjectName);
    return subjectScoreDrafts[student.id] || {
      activities: normalizeScoreArray(savedSubject?.activities).slice(0, assessmentCounts.activities),
      quizzes: normalizeScoreArray(savedSubject?.quizzes).slice(0, assessmentCounts.quizzes),
      exams: normalizeScoreArray(savedSubject?.exams).slice(0, assessmentCounts.exams),
      q1: savedSubject?.q1 ?? "",
      q2: savedSubject?.q2 ?? "",
      q3: savedSubject?.q3 ?? "",
      q4: savedSubject?.q4 ?? ""
    };
  };

  const updateSubjectScoreDraft = (studentId, field, value, scoreIndex = null) => {
    const student = allStudents.find((item) => item.id === studentId);
    if (!student) return;
    const currentDraft = {
      ...getSubjectScoreDraft(student),
      ...subjectScoreDrafts[studentId]
    };
    const nextValue = scoreIndex === null
      ? value
      : (() => {
        const values = normalizeScoreArray(currentDraft[field]);
        const neededLength = Math.max(assessmentCounts[field] || 1, scoreIndex + 1);

        while (values.length < neededLength) values.push("");
        values[scoreIndex] = value;

        return values;
      })();

    setSubjectScoreDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: {
        ...currentDraft,
        ...currentDrafts[studentId],
        [field]: nextValue
      }
    }));
  };

  const addAssessmentColumn = (field) => {
    setAssessmentCounts((currentCounts) => ({
      ...currentCounts,
      [field]: currentCounts[field] + 1
    }));
    setSubjectScoreDrafts((currentDrafts) => Object.entries(currentDrafts).reduce((drafts, [studentId, draft]) => ({
      ...drafts,
      [studentId]: {
        ...draft,
        [field]: [...normalizeScoreArray(draft[field]), ""]
      }
    }), {}));
  };

  const removeAssessmentColumn = (field) => {
    const nextLength = Math.max(1, (assessmentCounts[field] || 1) - 1);

    setAssessmentCounts((currentCounts) => ({
      ...currentCounts,
      [field]: nextLength
    }));
    setSubjectScoreDrafts((currentDrafts) => Object.entries(currentDrafts).reduce((drafts, [studentId, draft]) => ({
      ...drafts,
      [studentId]: {
        ...draft,
        [field]: normalizeScoreArray(draft[field]).slice(0, nextLength)
      }
    }), {}));
  };

  const assessmentColumnHasScores = (field) => {
    const columnIndex = (assessmentCounts[field] || 1) - 1;

    return subjectStudents.some((student) => {
      const values = normalizeScoreArray(getSubjectScoreDraft(student)[field]);
      return hasScoreValue(values[columnIndex]);
    });
  };

  const handleRemoveAssessmentColumn = (field, label) => {
    if (assessmentCounts[field] <= 1) return;

    if (assessmentColumnHasScores(field)) {
      setSaveMessage(`Cannot remove the last ${label.toLowerCase()} because it already has scores.`);
      return;
    }

    removeAssessmentColumn(field);
  };

  const deleteSubject = async (subjectName) => {
    try {
      const nextSubjects = handledSubjects.filter((subject) => subject.toLowerCase() !== subjectName.toLowerCase());

      await saveTeacherSubjects(nextSubjects);
      setSubjectClassOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[buildSubjectKey(subjectName)];
        return nextOverrides;
      });
      setSubjectScoreDrafts({});
      setAssessmentCounts({ activities: 1, quizzes: 1, exams: 1 });

      if (selectedSubjectName.toLowerCase() === subjectName.toLowerCase()) {
        setSelectedSubjectName(nextSubjects[0] || "");
      }

      setSaveMessage(`${subjectName} deleted.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject could not be deleted.");
    }
  };

  const requestDeleteSubject = (subjectName) => {
    setConfirmState({
      action: "delete-subject",
      tone: "danger",
      title: `Delete ${subjectName}?`,
      message: "This removes the subject from your handled subjects and clears its selected classes.",
      confirmLabel: "Delete Subject",
      cancelLabel: "Keep Subject",
      subjectName
    });
  };

  const handleConfirmDecision = async () => {
    const decision = confirmState;
    if (!decision) return;

    if (decision.action === "delete-subject") {
      await deleteSubject(decision.subjectName);
      setConfirmState(null);
    }
  };

  const getActiveScoreIndexes = (field) => {
    return Array.from({ length: assessmentCounts[field] || 1 }, (_, index) => index)
      .filter((scoreIndex) => subjectStudents.some((student) => {
        const values = normalizeScoreArray(getSubjectScoreDraft(student)[field]);
        return hasScoreValue(values[scoreIndex]);
      }));
  };

  const buildSubjectScoresForSave = (student, activeScoreIndexes) => {
    const draft = getSubjectScoreDraft(student);

    return {
      ...draft,
      activities: activeScoreIndexes.activities.map((index) => normalizeScoreArray(draft.activities)[index] ?? ""),
      quizzes: activeScoreIndexes.quizzes.map((index) => normalizeScoreArray(draft.quizzes)[index] ?? ""),
      exams: activeScoreIndexes.exams.map((index) => normalizeScoreArray(draft.exams)[index] ?? "")
    };
  };

  const handleSaveAllSubjectScores = async () => {
    if (!selectedSubjectName || !subjectStudents.length) return;

    setSavingAllSubjectScores(true);

    try {
      const activeScoreIndexes = {
        activities: getActiveScoreIndexes("activities"),
        quizzes: getActiveScoreIndexes("quizzes"),
        exams: getActiveScoreIndexes("exams")
      };

      for (const student of subjectStudents) {
        await saveSubjectScores({
          studentId: student.id,
          subjectName: selectedSubjectName,
          scores: buildSubjectScoresForSave(student, activeScoreIndexes)
        });
      }

      setSubjectScoreDrafts({});
      setSaveMessage(`${selectedSubjectName} scores saved for ${subjectStudents.length} student${subjectStudents.length === 1 ? "" : "s"}.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject scores could not be saved.");
    } finally {
      setSavingAllSubjectScores(false);
    }
  };

  const handleApproveJoinRequest = async (request) => {
    try {
      await approveClassJoinRequest({
        classId: selectedClass?.id,
        studentId: request.studentId
      });
      setSaveMessage(`${request.studentName || "Student"} added to this class.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Join request could not be accepted.");
    }
  };

  const handleRejectJoinRequest = async (request) => {
    try {
      await rejectClassJoinRequest({
        classId: selectedClass?.id,
        studentId: request.studentId
      });
      setSaveMessage(`${request.studentName || "Student"} request declined.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Join request could not be declined.");
    }
  };

  const handleAddExistingStudent = async (event) => {
    event.preventDefault();

    if (!studentToAddId) {
      setSaveMessage("Select an existing student to add.");
      return;
    }

    const student = existingStudentOptions.find((item) => item.id === studentToAddId) || null;

    try {
      await addStudentToClass({
        classId: selectedClass?.id,
        studentId: studentToAddId
      });
      setAddingStudentToClass(false);
      setStudentToAddId("");
      setSaveMessage(`${student?.name || "Student"} added to this class.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Student could not be added to this class.");
    }
  };

  const handleMarkAll = (status) => {
    setDailyAttendanceDrafts(students.reduce((drafts, student) => ({
      ...drafts,
      [student.id]: status
    }), {}));
  };

  const handleSaveDailyAttendance = async () => {
    await saveDailyAttendanceRecord({
      classId: selectedClass?.id,
      className: selectedClass?.name || selectedClass?.section || "",
      date: attendanceDate,
      isNoClass: isNoClassDay,
      noClassReason,
      entries: students.map((student) => ({
        studentId: student.id,
        studentName: student.name,
        status: dailyAttendanceDrafts[student.id] || "present"
      }))
    });

    setSaveMessage(isNoClassDay
      ? `${formatDateLabel(attendanceDate)} marked as no class.`
      : `Attendance saved for ${formatDateLabel(attendanceDate)}.`);
  };

  const handleSaveStudent = async (formData) => {
    if (!managingStudent?.id) {
      throw new Error("Teachers can only edit existing students.");
    }

    const now = new Date().toISOString();
    const summaryParts = [];

    if (formData.gpa !== "") summaryParts.push(`GPA ${formData.gpa}`);
    if (formData.attendance !== "") summaryParts.push(`Attendance ${formData.attendance}%`);

    const activityEntry = {
      date: formatShortDate(now),
      activity: "Teacher Update",
      result: summaryParts.length ? summaryParts.join(" | ") : "Student record updated",
      remarks: formData.teacherRemarks || formData.performanceStatus
    };

    await saveStudentRecord({
      studentId: managingStudent?.id,
      payload: {
        ...formData,
        classId: selectedClass?.id,
        teacherId: selectedClass?.teacherId || selectedClass?.teacherUid || "",
        teacherEmail: selectedClass?.teacherEmail || selectedClass?.adviserEmail || "",
        teacherName: classTeacherName,
        activities: [activityEntry, ...(Array.isArray(managingStudent?.raw?.activities)
          ? managingStudent.raw.activities
          : Object.values(managingStudent?.raw?.activities || {}))].slice(0, 6)
      }
    });

    setManagingStudent(null);
    setSaveMessage("Student record updated.");
  };

  const renderClassSelector = () => (
    <div className="toolbar">
      <div>
        <h3>{sectionMeta[section] || "Teaching Dashboard"}</h3>
      </div>
      <div className="toolbar-actions">
        {isClassScopedSection && teacherClassReports.length > 0 && (
          <label className="selector-field">
            <span>Class</span>
            <select value={selectedClass?.id || ""} onChange={(event) => setSelectedClassId(event.target.value)}>
              {teacherClassReports.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name || classroom.section || classroom.id}
                </option>
              ))}
            </select>
          </label>
        )}
        {teacherClassReports.length > 0 && section === "students" && (
          <button type="button" className="secondary-btn" onClick={openAddStudentModal}>
            Add Student
          </button>
        )}
      </div>
    </div>
  );

  const renderSubjectManager = () => (
    <>
      <div className="panel">
        <div className="panel-header">
          <h3>Handled Subjects</h3>
          <button type="button" className="primary-btn" onClick={openSubjectModal}>Add Subject</button>
        </div>
        <label className="selector-field subject-search-field">
          <span>Search Subject</span>
          <input
            type="search"
            value={subjectSearch}
            onChange={(event) => setSubjectSearch(event.target.value)}
            placeholder="Search handled subjects"
          />
        </label>
        {handledSubjects.length ? (
          <div className="subject-picker">
            {filteredHandledSubjects.map((subject) => (
              <div
                key={subject}
                className={`subject-chip ${subject === selectedSubjectName ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="subject-chip-main"
                  onClick={() => {
                    setSelectedSubjectName(subject);
                    setSubjectScoreDrafts({});
                  }}
                >
                  {subject}
                </button>
                <button
                  type="button"
                  className="subject-chip-remove"
                  disabled={savingTeacherId === currentUser?.uid}
                  onClick={() => requestDeleteSubject(subject)}
                  aria-label={`Delete ${subject}`}
                >
                  x
                </button>
              </div>
            ))}
            {!filteredHandledSubjects.length && (
              <p className="empty-copy">No subjects match your search.</p>
            )}
          </div>
        ) : (
          <p className="empty-copy">Add a subject and choose the classes that will take it.</p>
        )}
      </div>

      {handledSubjects.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h3>Subject Score Workspace</h3>
            <span className="meta-badge">{selectedSubjectName || "Select Subject"}</span>
          </div>

          {selectedSubjectName && (
            <div className="subject-class-selector">
              <div className="panel-header">
                <h4>Classes Enrolled in {selectedSubjectName}</h4>
                <span className="meta-badge">{selectedSubjectClasses.length} selected</span>
              </div>
              <div className="class-checkbox-grid">
                {selectedSubjectClasses.map((classroom) => (
                  <div key={classroom.id} className="class-checkbox selected-class-item">
                    <span>{classroom.name || classroom.section || classroom.id}</span>
                  </div>
                ))}
                {!selectedSubjectClasses.length && (
                  <p className="empty-copy">No classes selected for this subject.</p>
                )}
              </div>
            </div>
          )}

          {selectedSubjectName && subjectStudents.length > 0 && (
            <div className="score-column-toolbar">
              <button
                type="button"
                className="primary-btn score-save-all-btn"
                disabled={savingAllSubjectScores}
                onClick={handleSaveAllSubjectScores}
              >
                {savingAllSubjectScores ? "Saving..." : "Save Scores"}
              </button>
              {[
                ["activities", "Activity"],
                ["quizzes", "Quiz"],
                ["exams", "Exam"]
              ].map(([field, label]) => {
                const hasScoresInLastColumn = assessmentColumnHasScores(field);

                return (
                  <div key={field} className="score-column-control">
                    <span>{label}</span>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={assessmentCounts[field] <= 1 || hasScoresInLastColumn}
                      title={hasScoresInLastColumn ? `Cannot remove a ${label.toLowerCase()} column that has scores.` : ""}
                      onClick={() => handleRemoveAssessmentColumn(field, label)}
                    >
                      -
                    </button>
                    <strong>{assessmentCounts[field]}</strong>
                    <button type="button" className="secondary-btn" onClick={() => addAssessmentColumn(field)}>
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {selectedSubjectName && Object.entries(subjectStudentGroups).map(([sectionName, sectionStudents]) => (
            <div key={sectionName} className="subject-section-panel">
              <div className="panel-header">
                <h4>{sectionName}</h4>
                <span className="meta-badge">{sectionStudents.length} students</span>
              </div>
              <div className="score-table-wrap">
                <table className="data-table subject-score-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      {Array.from({ length: assessmentCounts.activities }, (_, index) => (
                        <th key={`activity-${index}`}>Activity {index + 1}</th>
                      ))}
                      {Array.from({ length: assessmentCounts.quizzes }, (_, index) => (
                        <th key={`quiz-${index}`}>Quiz {index + 1}</th>
                      ))}
                      {Array.from({ length: assessmentCounts.exams }, (_, index) => (
                        <th key={`exam-${index}`}>Exam {index + 1}</th>
                      ))}
                      <th>Q1</th>
                      <th>Q2</th>
                      <th>Q3</th>
                      <th>Q4</th>
                      <th>Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionStudents.map((student) => {
                      const savedSubject = getStudentSubjectRecord(student, selectedSubjectName);
                      const draft = getSubjectScoreDraft(student);
                      const quarterGrades = [draft.q1, draft.q2, draft.q3, draft.q4]
                        .map((value) => Number(value))
                        .filter((value) => Number.isFinite(value));
                      const draftFinalGrade = quarterGrades.length
                        ? Number((quarterGrades.reduce((sum, value) => sum + value, 0) / quarterGrades.length).toFixed(1))
                        : savedSubject?.finalGrade ?? "N/A";

                      return (
                        <tr key={student.id}>
                          <td data-label="Student" className="student-score-cell">
                            <strong>{student.name}</strong>
                            <p className="muted-text">{student.studentNumber || "No ID"}</p>
                          </td>
                          {["activities", "quizzes", "exams"].flatMap((field) => {
                            const label = field === "activities" ? "Activity" : field === "quizzes" ? "Quiz" : "Exam";
                            const count = assessmentCounts[field];
                            const values = normalizeScoreArray(draft[field]);

                            return Array.from({ length: count }, (_, index) => (
                              <td key={`${field}-${index}`} data-label={`${label} ${index + 1}`}>
                                <input
                                  type="number"
                                  value={values[index] ?? ""}
                                  onChange={(event) => updateSubjectScoreDraft(student.id, field, event.target.value, index)}
                                  placeholder="-"
                                />
                              </td>
                            ));
                          })}
                          {["q1", "q2", "q3", "q4"].map((field) => (
                            <td key={field} data-label={field.toUpperCase()}>
                              <input
                                type="number"
                                value={draft[field]}
                                onChange={(event) => updateSubjectScoreDraft(student.id, field, event.target.value)}
                                placeholder="-"
                              />
                            </td>
                          ))}
                          <td data-label="Final" className="final-score-cell">{draftFinalGrade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {selectedSubjectName && !subjectStudents.length && (
            <p className="empty-copy">Choose one or more classes for this subject to show enrolled students.</p>
          )}
        </div>
      )}
    </>
  );

  const renderEnrollmentRequests = () => (
    <div className="panel">
      <div className="panel-header">
        <h3>Enrollment Requests</h3>
        <span className="meta-badge">{pendingJoinRequests.length} pending</span>
      </div>
      {pendingJoinRequests.length ? (
        <ul className="stack-list">
          {pendingJoinRequests.map((request) => (
            <li key={request.studentId} className="list-row">
              <div>
                <strong>{request.studentName || request.email || "Student"}</strong>
                <p>{request.email || request.studentNumber || "Waiting for approval"}</p>
              </div>
              <div className="table-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={savingEnrollmentStudentId === request.studentId}
                  onClick={() => handleApproveJoinRequest(request)}
                >
                  {savingEnrollmentStudentId === request.studentId ? "Saving..." : "Accept"}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={savingEnrollmentStudentId === request.studentId}
                  onClick={() => handleRejectJoinRequest(request)}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">No students are waiting to join this class.</p>
      )}
    </div>
  );

  const renderAddExistingStudentModal = () => (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="panel-header">
          <h3>Add Student to Class</h3>
          <span className="meta-badge">{selectedClass?.name || selectedClass?.section || "Class"}</span>
        </div>
        <form onSubmit={handleAddExistingStudent}>
          {existingStudentOptions.length ? (
            <div className="modal-form-grid">
              <div className="form-group form-group-full">
                <label>Existing Student</label>
                <select
                  value={studentToAddId}
                  onChange={(event) => setStudentToAddId(event.target.value)}
                  required
                >
                  {existingStudentOptions.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} {student.studentNumber ? `(${student.studentNumber})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <p className="empty-copy">No unassigned existing students match this class grade level.</p>
          )}

          <div className="modal-actions">
            <button type="submit" className="primary-btn" disabled={!existingStudentOptions.length || Boolean(savingEnrollmentStudentId)}>
              {savingEnrollmentStudentId ? "Adding..." : "Add to Class"}
            </button>
            <button type="button" className="secondary-btn" onClick={() => setAddingStudentToClass(false)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (loading) return <div className="loading-container">Loading dashboard...</div>;

  return (
    <div className="teacher-view">
      {error && <div className="error-container">{error}</div>}
      {saveMessage && <div className="success-banner">{saveMessage}</div>}

      {renderClassSelector()}

      {isClassScopedSection && !teacherClassReports.length && (
        <div className="empty-state">
          <h3>No Advisory</h3>
          <p>Wait for an admin to assign your advisory class.</p>
        </div>
      )}

      {section === "subjects" && renderSubjectManager()}

      {teacherClassReports.length > 0 && (
        <>

      {isDashboardSection && (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Assigned Classes</h4>
            <p>{teacherClassReports.length}</p>
          </div>
          <div className="stat-card">
            <h4>Class Average</h4>
            <p>{selectedClass?.averageGpa ?? "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Attendance Average</h4>
            <p>{Number.isFinite(selectedClass?.averageAttendance) ? `${selectedClass.averageAttendance}%` : "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Students in Class</h4>
            <p>{students.length}</p>
          </div>
        </div>
      )}

      {isDashboardSection && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>{selectedClass?.name || selectedClass?.section || "Selected Class"}</h3>
                <div className="inline-actions">
                  {selectedClass?.classCode && (
                    <span className="meta-badge">Code {selectedClass.classCode}</span>
                  )}
                  {(selectedClass?.subject || selectedClass?.gradeLevel) && (
                    <span className="meta-badge">{selectedClass?.subject || selectedClass?.gradeLevel}</span>
                  )}
                  <span className="meta-badge">{classTeacherName}</span>
                </div>
              </div>
              <div className="report-strip">
                <div>
                  <span>Students</span>
                  <strong>{students.length}</strong>
                </div>
                <div>
                  <span>Completion</span>
                  <strong>{selectedClass?.completionRate ?? 0}%</strong>
                </div>
                <div>
                  <span>Excellence</span>
                  <strong>{selectedClass?.excellentCount ?? 0}</strong>
                </div>
              </div>
              <p className="mt-4">
                {topPerformer
                  ? `${topPerformer.name} is leading this class with a ${topPerformer.gpa} average.`
                  : "Add students to start building this class roster."}
              </p>
            </div>

            <div className="panel">
              <h3>Support Watchlist</h3>
              {studentsNeedingSupport.length ? (
                <ul className="stack-list">
                  {studentsNeedingSupport.slice(0, 4).map((student) => (
                    <li key={student.id} className="list-row">
                      <div>
                        <strong>{student.name}</strong>
                        <p>{student.alerts[0] || "Monitor learner progress."}</p>
                      </div>
                      <button type="button" className="secondary-btn" onClick={() => openStudentModal(student)}>
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No current alerts.</p>
              )}
            </div>
          </div>

        </>
      )}

      {section === "students" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Class Roster</h3>
            <button type="button" className="primary-btn" onClick={openAddStudentModal}>
              Add Student
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Average</th>
                <th>Attendance</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td data-label="Name">{student.name}</td>
                  <td data-label="Average">{student.gpa ?? "N/A"}</td>
                  <td data-label="Attendance">{student.attendanceLabel}</td>
                  <td data-label="Status"><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                  <td data-label="Action">
                    <button className="secondary-btn" type="button" onClick={() => openStudentModal(student)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan="5">No students found for this class.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "requests" && renderEnrollmentRequests()}

      {section === "gradebook" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Class Gradebook</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Q1 Avg</th>
                <th>Q2 Avg</th>
                <th>Attendance</th>
                <th>Performance</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td data-label="Name">{student.name}</td>
                  <td data-label="Q1 Avg">{student.q1Average ?? "N/A"}</td>
                  <td data-label="Q2 Avg">{student.q2Average ?? "N/A"}</td>
                  <td data-label="Attendance">{student.attendanceLabel}</td>
                  <td data-label="Performance"><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                  <td data-label="Remarks">{student.teacherRemarks || "None"}</td>
                  <td data-label="Action">
                    <button className="secondary-btn" type="button" onClick={() => openStudentModal(student)}>
                      {savingStudentId === student.id ? "Saving..." : "Edit"}
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan="7">No students found for this class.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "attendance" && (
        <>
          <div className="panel attendance-sheet">
            <div className="panel-header">
              <div>
                <h3>Attendance Sheet</h3>
                <p className="muted-text">{selectedClass?.name || selectedClass?.section || "Selected Class"} - {formatDateLabel(attendanceDate)}</p>
              </div>
              <span className="meta-badge">{students.length} students</span>
            </div>

            <div className="attendance-sheet-toolbar">
              <label className="selector-field">
                <span>Date</span>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(event) => setAttendanceDate(event.target.value)}
                />
              </label>
              <label className="attendance-toggle">
                <input
                  type="checkbox"
                  checked={isNoClassDay}
                  onChange={(event) => setIsNoClassDay(event.target.checked)}
                />
                <span>No Class</span>
              </label>
              {!isNoClassDay && (
                <div className="attendance-mark-all">
                  <button type="button" className="secondary-btn" onClick={() => handleMarkAll("present")}>
                    All Present
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => handleMarkAll("absent")}>
                    All Absent
                  </button>
                </div>
              )}
            </div>

            {isNoClassDay ? (
              <div className="form-group">
                <label>Reason</label>
                <textarea
                  value={noClassReason}
                  onChange={(event) => setNoClassReason(event.target.value)}
                  rows="3"
                  placeholder="Example: Holiday, school activity, or class suspension"
                />
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td data-label="Student">{student.name}</td>
                      <td data-label="Attendance">
                        <div className="attendance-options" role="group" aria-label={`Attendance for ${student.name}`}>
                          {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`attendance-option ${option.value}${(dailyAttendanceDrafts[student.id] || "present") === option.value ? " active" : ""}`}
                              onClick={() => handleDailyAttendanceChange(student.id, option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan="2">No students found for this class.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {!isNoClassDay && (
              <div className="attendance-sheet-summary">
                <span>Present/Credited: <strong>{dailyPresentCount}</strong></span>
                <span>Absent: <strong>{dailyAbsentCount}</strong></span>
              </div>
            )}

            <button
              type="button"
              className="primary-btn attendance-save-btn"
              disabled={savingAttendanceKey === `${selectedClass?.id}-${attendanceDate}`}
              onClick={handleSaveDailyAttendance}
            >
              {savingAttendanceKey === `${selectedClass?.id}-${attendanceDate}` ? "Saving..." : "Save Attendance"}
            </button>
          </div>

        </>
      )}

      {section === "reports" && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <h3>Grade Distribution</h3>
              <div className="distribution-list">
                {gradeDistribution.map((item) => {
                  const percentage = students.length ? Math.round((item.count / students.length) * 100) : 0;

                  return (
                    <div key={item.label} className="distribution-item">
                      <div className="list-row">
                        <strong>{item.label}</strong>
                        <span>{item.count} students</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <h3>Recent Updates</h3>
              {recentUpdates.length ? (
                <ul className="stack-list">
                  {recentUpdates.map((student) => (
                    <li key={student.id} className="list-row">
                      <div>
                        <strong>{student.name}</strong>
                        <p>{student.recentActivity[0]?.result || `Updated ${student.updatedLabel}`}</p>
                      </div>
                      <span>{student.updatedLabel}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No recent updates.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <h3>Performance Report</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Overall Average</th>
                  <th>Attendance</th>
                  <th>Status</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student">{student.name}</td>
                    <td data-label="Overall Average">{student.gpa ?? "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Status"><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                    <td data-label="Alerts">{student.alerts.join(" ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {addingStudentToClass && renderAddExistingStudentModal()}

      {showSubjectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>Add Subject</h3>
            </div>
            <form onSubmit={handleAddSubject}>
              <div className="form-group">
                <label>Subject Name</label>
                <input
                  type="text"
                  value={subjectForm.name}
                  onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })}
                  placeholder="Example: Mathematics"
                  required
                />
              </div>

              <div className="subject-class-selector">
                <div className="panel-header">
                  <h4>Classes Taking This Subject</h4>
                  <span className="meta-badge">{subjectForm.classIds.length} selected</span>
                </div>
                <div className="class-checkbox-grid">
                  {classReports.map((classroom) => (
                    <label key={classroom.id} className="class-checkbox">
                      <input
                        type="checkbox"
                        checked={subjectForm.classIds.includes(classroom.id)}
                        onChange={() => handleSubjectFormClassToggle(classroom.id)}
                      />
                      <span>{classroom.name || classroom.section || classroom.id}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="primary-btn" disabled={savingTeacherId === currentUser?.uid}>
                  {savingTeacherId === currentUser?.uid ? "Saving..." : "Add Subject"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => setShowSubjectModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managingStudent && (
        <StudentRecordModal
          title={`Edit Student: ${managingStudent.name}`}
          student={managingStudent}
          defaultClassId={selectedClass?.id || ""}
          defaultTeacherId={selectedClass?.teacherId || selectedClass?.teacherUid || ""}
          defaultTeacherName={classTeacherName}
          defaultGradeLevel={selectedClass?.gradeLevel || ""}
          requireAccountFields={false}
          saving={Boolean(savingStudentId)}
          submitLabel="Save Changes"
          onClose={() => setManagingStudent(null)}
          onSubmit={handleSaveStudent}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          tone={confirmState.tone}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          busy={savingTeacherId === currentUser?.uid}
          onConfirm={handleConfirmDecision}
          onCancel={() => setConfirmState(null)}
        />
      )}
        </>
      )}
    </div>
  );
};

export default TeacherView;
