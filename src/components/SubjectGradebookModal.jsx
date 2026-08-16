import React from "react";
import { X } from "lucide-react";
import {
  calculateQuarterGradeDetails,
  DEFAULT_GRADE_WEIGHTS,
  FIXED_ASSESSMENT_SLOTS,
  normalizeQuarterScores,
  parseScoreEntry,
  TERM_OPTIONS as QUARTER_OPTIONS,
  toNumber
} from "../utils/reporting";

const FIXED_ASSESSMENT_COLUMNS = [
  ...Array.from({ length: FIXED_ASSESSMENT_SLOTS.writtenWork }, (_, index) => ({
    categoryKey: "writtenWork",
    subcategoryKey: "quizzes",
    index,
    shortLabel: `Written / Oral Work ${index + 1}`
  })),
  ...Array.from({ length: FIXED_ASSESSMENT_SLOTS.performanceTask }, (_, index) => ({
    categoryKey: "performanceTask",
    subcategoryKey: "activities",
    index,
    shortLabel: `Performance Task ${index + 1}`
  })),
  ...Array.from({ length: FIXED_ASSESSMENT_SLOTS.finalExam }, (_, index) => ({
    categoryKey: "finalExam",
    subcategoryKey: "exams",
    index,
    shortLabel: `Summative ${index + 1}`
  }))
];

const formatGradeSheetValue = (value, { decimals = 2, blank = "", trimZeros = false } = {}) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return blank;

  const fixedValue = numericValue.toFixed(decimals);
  if (!trimZeros) return fixedValue;

  return fixedValue
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
};

const getAssessmentColumnHeaderLabel = (column) => {
  if (column.categoryKey === "finalExam") {
    const defaultFinalExamLabels = ["ST1", "ST2", "TE"];
    return defaultFinalExamLabels[column.index] || `EX${column.index + 1}`;
  }

  return `${column.index + 1}`;
};

const ensureFixedScoreEntries = (values, categoryKey) => {
  const slotCount = FIXED_ASSESSMENT_SLOTS[categoryKey] || 0;
  const nextValues = Array.isArray(values) ? [...values] : [];
  while (nextValues.length < slotCount) nextValues.push("");
  return nextValues.slice(0, slotCount);
};
const getSubjectSnapshotGrade = (subject) => (
  subject?.finalGrade
  ?? subject?.q3
  ?? subject?.q2
  ?? subject?.q1
  ?? "N/A"
);

const parseScoreParts = (value) => {
  const parsedEntry = parseScoreEntry(value);

  return {
    score: parsedEntry?.scoreValue || "",
    total: parsedEntry?.totalValue || ""
  };
};

const summarizeScoreEntries = (values = []) => {
  let earnedTotal = 0;
  let possibleTotal = 0;
  let usedPossibleScores = false;
  const fallbackScores = [];

  values.forEach((value) => {
    const parsedEntry = parseScoreEntry(value);
    if (!parsedEntry) return;

    const earned = toNumber(parsedEntry.scoreValue);
    const total = toNumber(parsedEntry.totalValue);

    if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
      earnedTotal += earned;
      possibleTotal += total;
      usedPossibleScores = true;
      return;
    }

    if (Number.isFinite(parsedEntry.numericValue)) {
      fallbackScores.push(parsedEntry.numericValue);
    }
  });

  if (usedPossibleScores) {
    return {
      earnedTotal,
      possibleTotal
    };
  }

  if (fallbackScores.length) {
    const averageScore = fallbackScores.reduce((sum, score) => sum + score, 0) / fallbackScores.length;
    return {
      earnedTotal: averageScore,
      possibleTotal: null
    };
  }

  return {
    earnedTotal: null,
    possibleTotal: null
  };
};

const SubjectGradebookModal = ({
  subject,
  learnerName,
  learnerSubcopy,
  onClose
}) => {
  if (!subject) return null;

  const gradeWeights = {
    ...DEFAULT_GRADE_WEIGHTS,
    ...(subject.gradeWeights || {})
  };
  const quarters = normalizeQuarterScores(subject);
  const writtenColumns = FIXED_ASSESSMENT_COLUMNS.filter((column) => column.categoryKey === "writtenWork");
  const performanceColumns = FIXED_ASSESSMENT_COLUMNS.filter((column) => column.categoryKey === "performanceTask");
  const examColumns = FIXED_ASSESSMENT_COLUMNS.filter((column) => column.categoryKey === "finalExam");
  const categoryConfigs = [
    {
      key: "writtenWork",
      label: "Written / Oral Works",
      weightLabel: `${gradeWeights.writtenWork}%`,
      columns: writtenColumns
    },
    {
      key: "performanceTask",
      label: "Product / Performance Tasks",
      weightLabel: `${gradeWeights.performanceTask}%`,
      columns: performanceColumns
    },
    {
      key: "finalExam",
      label: "Summative Tests / Exams",
      weightLabel: `${gradeWeights.finalExam}%`,
      columns: examColumns
    }
  ];

  const getAssessmentColumnEntry = (quarterScores, column) => {
    const values = ensureFixedScoreEntries(quarterScores[column.categoryKey]?.[column.subcategoryKey], column.categoryKey);
    return values[column.index] || "";
  };

  const getCategorySummary = (quarterScores, categoryKey) => {
    const detailMap = calculateQuarterGradeDetails(quarterScores, gradeWeights).categories
      .reduce((map, category) => ({
        ...map,
        [category.key]: category
      }), {});
    const values = categoryKey === "writtenWork"
      ? ensureFixedScoreEntries(quarterScores.writtenWork?.quizzes, categoryKey)
      : categoryKey === "performanceTask"
        ? ensureFixedScoreEntries(quarterScores.performanceTask?.activities, categoryKey)
        : ensureFixedScoreEntries(quarterScores.finalExam?.exams, categoryKey);
    const scoreSummary = summarizeScoreEntries(values);
    const categoryDetail = detailMap[categoryKey] || {};

    return {
      total: scoreSummary.earnedTotal,
      possibleTotal: scoreSummary.possibleTotal,
      percentageScore: categoryDetail.percentageScore,
      weightedScore: categoryDetail.weightedScore
    };
  };

  const getAssessmentColumnPossibleTotal = (quarterScores, column) => {
    const scoreParts = parseScoreParts(getAssessmentColumnEntry(quarterScores, column));
    const totalValue = toNumber(scoreParts.total);
    return Number.isFinite(totalValue) ? totalValue : null;
  };

  const getPossibleTotalForColumns = (quarterScores, columns = []) => {
    const totalValues = columns
      .map((column) => getAssessmentColumnPossibleTotal(quarterScores, column))
      .filter((value) => Number.isFinite(value));

    if (!totalValues.length) return null;

    return totalValues.reduce((sum, value) => sum + value, 0);
  };

  const totalColumnCount = 1
    + categoryConfigs.reduce((sum, category) => sum + category.columns.length + 1, 0)
    + 2;

  return (
    <div className="modal-overlay">
      <div className="modal-content subject-gradebook-modal">
        <div className="panel-header">
          <div>
            <h3>{subject.name}</h3>
          </div>
          <div className="inline-actions">
            <span className="meta-badge">Final Grade {getSubjectSnapshotGrade(subject)}</span>
            <button
              type="button"
              className="modal-close-btn"
              aria-label="Close subject grades"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="subject-gradebook-stack">
          {QUARTER_OPTIONS.map((quarter) => {
            const quarterScores = quarters[quarter.key];
            const quarterDetail = calculateQuarterGradeDetails(quarterScores, gradeWeights);

            return (
              <section key={quarter.key} className="subject-gradebook-section">
                <div className="subject-gradebook-section-header">
                  <h4>{quarter.label}</h4>
                </div>
                <div className="score-table-wrap">
                  <table className="data-table subject-score-table class-record-table">
                    <thead>
                      <tr className="class-record-group-row">
                        <th rowSpan={2} className="class-record-student-col">LEARNERS&apos; NAMES</th>
                        {categoryConfigs.map((category) => (
                          <th
                            key={category.key}
                            colSpan={category.columns.length + 1}
                            className="class-record-group-cell is-active"
                          >
                            <div className="class-record-group-toggle is-expanded is-static">
                              <span className="class-record-group-copy">
                                <span className="class-record-group-title">{category.label}</span>
                                <span className="class-record-group-weight">{category.weightLabel}</span>
                              </span>
                            </div>
                          </th>
                        ))}
                        <th rowSpan={2} className="class-record-summary-col class-record-summary-grade">
                          <span className="class-record-summary-label">Initial Grade</span>
                        </th>
                        <th rowSpan={2} className="class-record-summary-col class-record-summary-term">
                          <span className="class-record-summary-label">Term Grade</span>
                        </th>
                      </tr>
                      <tr className="class-record-subheader-row">
                        {categoryConfigs.flatMap((category) => ([
                          ...category.columns.map((column) => (
                            <th
                              key={`${quarter.key}-${category.key}-${column.subcategoryKey}-${column.index}`}
                              className="class-record-category-head is-active"
                            >
                              <div className="assessment-column-header">
                                <span>{getAssessmentColumnHeaderLabel(column)}</span>
                              </div>
                            </th>
                          )),
                          <th
                            key={`${quarter.key}-${category.key}-total`}
                            className="class-record-category-head class-record-category-total is-active"
                          >
                            Total
                          </th>
                        ]))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="class-record-reference-row">
                        <td data-label="Learners">HIGHEST POSSIBLE SCORE</td>
                        {categoryConfigs.flatMap((category) => {
                          const categoryPossibleTotal = getPossibleTotalForColumns(quarterScores, category.columns);

                          return [
                            ...category.columns.map((column) => (
                              <td
                                key={`possible-${quarter.key}-${category.key}-${column.subcategoryKey}-${column.index}`}
                                data-label={getAssessmentColumnHeaderLabel(column)}
                                className="class-record-category-cell is-active"
                              >
                                {formatGradeSheetValue(
                                  getAssessmentColumnPossibleTotal(quarterScores, column),
                                  { decimals: 0, blank: "" }
                                )}
                              </td>
                            )),
                            <td
                              key={`possible-total-${quarter.key}-${category.key}`}
                              data-label="Total"
                              className="class-record-category-cell is-active"
                            >
                              {formatGradeSheetValue(categoryPossibleTotal, { decimals: 0, blank: "" })}
                            </td>
                          ];
                        })}
                        <td data-label="Initial Grade" className="class-record-summary-col class-record-summary-grade" />
                        <td data-label="Term Grade" className="class-record-summary-col class-record-summary-term" />
                      </tr>
                      <tr>
                        <td data-label="Learners" className="student-score-cell class-record-student-col">
                          <div>
                            <strong>{learnerName}</strong>
                            {learnerSubcopy && <p className="muted-text">{learnerSubcopy}</p>}
                          </div>
                        </td>
                        {categoryConfigs.flatMap((category) => {
                          const categorySummary = getCategorySummary(quarterScores, category.key);

                          return [
                            ...category.columns.map((column) => {
                              const scoreParts = parseScoreParts(getAssessmentColumnEntry(quarterScores, column));
                              const hasTotalPoints = Boolean(String(scoreParts.total || "").trim());
                              const hasScoreValue = Boolean(String(scoreParts.score || "").trim());

                              return (
                                <td
                                  key={`${subject.id}-${quarter.key}-${column.categoryKey}-${column.subcategoryKey}-${column.index}`}
                                  data-label={column.shortLabel}
                                  className="class-record-category-cell is-active"
                                >
                                  <div className={`score-entry-field is-readonly${hasTotalPoints ? " has-total" : " is-compact"}`}>
                                    <span className="score-readonly-box">{hasScoreValue ? scoreParts.score : ""}</span>
                                    {hasTotalPoints && <span className="score-total-label">/ {scoreParts.total}</span>}
                                  </div>
                                </td>
                              );
                            }),
                            <td
                              key={`${subject.id}-${quarter.key}-${category.key}-total`}
                              data-label="Total"
                              className="class-record-category-cell is-active"
                            >
                              {formatGradeSheetValue(categorySummary.total, {
                                decimals: categorySummary.possibleTotal ? 0 : 2,
                                blank: ""
                              })}
                            </td>
                          ];
                        })}
                        <td data-label="Initial Grade" className="final-score-cell class-record-summary-col class-record-summary-grade">
                          {formatGradeSheetValue(quarterDetail.initialGrade, { decimals: 2, blank: "" })}
                        </td>
                        <td data-label="Term Grade" className="final-score-cell class-record-summary-col class-record-summary-term">
                          {formatGradeSheetValue(quarterDetail.transmutedGrade, { decimals: 0, blank: "" })}
                        </td>
                      </tr>
                      {!subject.name && (
                        <tr>
                          <td colSpan={totalColumnCount}>No grade details available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SubjectGradebookModal;
