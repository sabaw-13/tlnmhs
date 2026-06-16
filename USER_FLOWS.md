# E-Track User Flows

This guide explains the flow of each user in the system in a simple and detailed way.

## Roles in the system

- Admin
- Teacher
- Student
- Parent

## Common system flow

1. The user opens the app and goes to the login page.
2. The user enters their email and password.
3. The system checks Firebase Authentication.
4. After login, the system loads the user's profile from the database.
5. The system sends the user to the correct dashboard based on role.

Role routing:

- `admin` -> Admin Dashboard
- `teacher` -> Teacher Dashboard
- `student` -> Student Dashboard
- `parent` -> Parent Dashboard

---

## 1. Admin Flow

### Simple flow

1. Admin logs in.
2. Admin opens the dashboard to see school totals and activity.
3. Admin manages students, sections, teachers, and parents.
4. Admin approves parent-related requests.
5. Admin reviews reports.
6. Admin updates settings or logs out.

### Detailed flow

#### A. Login and dashboard

1. Admin logs in using an admin account.
2. The system verifies that the user's role is `admin`.
3. The admin lands on the main dashboard.
4. The dashboard shows:
- total teachers
- total students
- total parents
- total sections
- enrollment by grade
- students with sections
- live reports
- at-risk students
- recent repository activity

#### B. Student management

1. Admin opens `Students`.
2. Admin can:
- search by student name, ID number, or email
- filter by grade
- filter by section
- add a new student
- edit an existing student
- bulk import students using CSV
3. When adding a new student:
- the system creates a student login account
- the student's default password is the student ID number
- the student can be assigned to a grade and section
- adviser details are saved with the student record
4. When editing a student:
- admin can update personal details
- admin can update section, grade, adviser, attendance, GPA, remarks, and subjects
5. If a student is moved to another section:
- the old section link is removed
- the new section link is added

#### C. Grade level and section management

1. Admin opens `Sections`.
2. Admin manages `Grade Levels`.
3. Admin can:
- add a grade level
- activate an inactive grade level
- deactivate a grade level if no section is using it
4. Admin manages `Sections`.
5. Admin can:
- create a section
- edit a section
- assign an adviser
- save a unique section code
6. When a section is saved:
- the section is linked to its grade level
- the adviser is linked to that advisory class

#### D. Teacher management

1. Admin opens `Teachers`.
2. Admin can:
- add a teacher account
- edit teacher details
- assign handled subjects
- assign advisory section
- reset teacher password
- delete teacher account
3. When a new teacher is created:
- the system creates a teacher login account
- the teacher uses the email and password given by the admin

#### E. Parent management

1. Admin opens `Parents`.
2. Admin can:
- view parent accounts
- see linked students
- reset parent passwords
- delete parent accounts

#### F. Request approval flow

1. Admin opens the pending requests list.
2. Admin can review two request types:
- parent account requests
- parent student access requests
3. For parent account requests:
- admin checks the parent details
- admin checks the student ID
- if valid, the system creates the parent account
- the system links the parent to the student
4. For parent student access requests:
- admin checks the parent and student match
- if approved, the parent gets access to that student record
5. Admin can also reject either request.

#### G. Reports

1. Admin opens `Reports`.
2. Admin sees school-wide section performance.
3. Each section report includes:
- number of students
- average GPA
- average attendance
- number of students needing support

#### H. Settings and sign out

1. Admin opens `Settings`.
2. Admin can view account details and change theme.
3. Admin can sign out from the sidebar.

---

## 2. Teacher Flow

### Simple flow

1. Teacher logs in.
2. Teacher checks the dashboard.
3. Teacher manages subjects and advisory students.
4. Teacher records attendance.
5. Teacher inputs grades in the Subjects tab.
6. Teacher manages class fees.
7. Teacher reviews settings or logs out.

### Detailed flow

#### A. Login and dashboard

1. Teacher logs in using a teacher account created by the admin.
2. The system checks that the user's role is `teacher`.
3. The teacher lands on the teaching dashboard.
4. The dashboard shows:
- advisory or handled student count
- subject distribution
- attendance averages
- recent student updates
- quick access to students, attendance, and gradebook

#### B. Subject management

1. Teacher opens `Subjects`.
2. Teacher can:
- add a handled subject
- enter subject code
- enter subject name
- assign one or more sections to the subject
- edit a subject's section assignments
- delete a subject
3. This is also where the teacher encodes and saves subject scores.

#### C. Student management

1. Teacher opens `Students`.
2. The teacher works only inside the assigned advisory section.
3. Teacher can:
- view the section roster
- add a new student directly to the advisory section
- add an existing student to the advisory section
- edit a student's profile
4. When adding a new student:
- the system creates the student login account
- the default password is the student ID number
- the student is linked to the teacher's advisory section
5. When adding an existing student:
- the student is moved or linked into the teacher's section
6. Teacher restrictions:
- teachers cannot manage students outside their own advisory section

#### D. Attendance flow

1. Teacher opens `Attendance`.
2. Teacher selects:
- subject
- section
- date
3. Teacher marks each student as:
- present
- absent
- late
- excused
- unexcused
4. Teacher may also mark the day as `No Class`.
5. Teacher saves attendance.
6. After saving:
- the attendance record is stored for that section, subject, and date
- each student's subject attendance is updated
- each student's overall attendance is recalculated
- each student's performance status can also update

#### E. Grade entry and Gradebook flow

1. Teacher opens `Subjects`.
2. Teacher selects a handled subject and assigned section.
3. Teacher encodes quarterly scores for students.
4. Teacher can:
- add assessment columns
- remove assessment columns
- review quarter breakdowns
- save scores for all visible students
5. The system calculates:
- quarter grades
- final grade
- subject status
6. Teacher opens `Gradebook` to view the computed grade summary.
7. The Gradebook tab is for viewing and reviewing student grades, attendance, and final results per subject.
8. No grade editing or encoding is done in the Gradebook tab.

#### F. Fee management

1. Teacher opens `Fee`.
2. The teacher can manage fees only for the advisory class.
3. Teacher can:
- add a fee
- enter amount
- enter due date
- add notes
- edit fee information
- delete a fee
4. Teacher can open a student payment view.
5. Teacher can mark each fee as:
- paid
- unpaid
6. The payment date is stored when marked paid.

#### G. Settings and sign out

1. Teacher opens `Settings`.
2. Teacher can view account details and change theme.
3. Teacher signs out from the sidebar.

---

## 3. Student Flow

### Simple flow

1. Student logs in.
2. If not yet assigned to a section, the student enters a section code.
3. The student waits for approval or assignment.
4. Once connected to a section, the student views grades, attendance, and fees.
5. The student checks settings or logs out.

### Detailed flow

#### A. Login

1. Student logs in using the account created by admin or teacher.
2. The system checks that the user's role is `student`.
3. The system loads the student's record.

#### B. Join section flow

1. If the student has no assigned section, the app shows `Join Section`.
2. The student enters the section code.
3. The system checks whether the section exists.
4. If valid:
- a join request is stored as `pending`
- the user's pending class reference is saved
5. The student then waits for teacher or admin handling.
6. If the student is already assigned to another section, the request is blocked.

#### C. Dashboard flow

1. Student opens the dashboard.
2. The dashboard shows:
- total subjects
- attendance rate
- subject list
- teacher names
- fee preview

#### D. Grades flow

1. Student opens `My Grades`.
2. Student can:
- view all subjects
- filter by subject
- view teacher per subject
- view Quarter 1 to Quarter 4 grades
- view final grade
- view attendance per subject
3. If the student clicks a quarter grade:
- the system opens the score breakdown
- quizzes, long tests, activities, projects, and exams can be viewed

#### E. Attendance flow

1. Student opens `Attendance`.
2. Student can:
- view attendance summary
- filter by subject
- browse attendance pages
3. Each record shows:
- date
- subject
- attendance status
- notes

#### F. Fees flow

1. Student opens `Fees`.
2. Student can view:
- fee name
- amount
- due date
- payment status
- paid date
- notes
3. The student is only viewing fee status, not editing it.

#### G. Settings and sign out

1. Student opens `Settings`.
2. Student can view account details and change theme.
3. Student signs out from the sidebar.

---

## 4. Parent Flow

### Simple flow

1. Parent requests an account from the login page.
2. Admin approves the parent account.
3. Parent logs in.
4. If the child is not yet linked, the parent requests access to a student.
5. Admin approves the student access request.
6. Parent views the child's report, attendance, and fees.
7. Parent checks settings or logs out.

### Detailed flow

#### A. Parent account request flow

1. Parent opens the login page.
2. Parent clicks `Request parent account`.
3. Parent enters:
- parent name
- email
- requested password
- student ID
4. The system checks whether the student ID matches an existing student.
5. The request is saved as `pending`.
6. The parent waits for admin approval.

#### B. Parent login flow

1. After approval, the parent logs in.
2. The system checks that the user's role is `parent`.
3. If a student is already linked, the parent goes directly to the parent dashboard.
4. If no student is linked yet, the parent sees the access request panel.

#### C. Student access request flow

1. Parent opens `Request Student Access` if needed.
2. Parent enters:
- student ID number
- or student full name
3. The system looks for a matching student.
4. If found:
- an access request is saved as `pending`
- the parent can wait for admin approval
5. Parent can cancel a pending request before approval.
6. Once approved:
- the student is linked to the parent account
- the child record appears in the parent dashboard

#### D. Dashboard flow

1. Parent opens the dashboard.
2. The dashboard shows:
- selected child
- child's section
- total subjects
- attendance rate
- subject preview
- fee preview
3. If the parent has more than one linked student:
- the parent can switch between students using the selector

#### E. Child report flow

1. Parent opens `Child Report`.
2. Parent can view:
- subject list
- teacher per subject
- quarter grades
- final grade
- attendance per subject
3. If the parent clicks a quarter grade:
- the score breakdown opens
- quizzes, long tests, activities, projects, and exams can be viewed

#### F. Attendance flow

1. Parent opens `Attendance`.
2. Parent can:
- view class days
- view present and absent totals
- filter attendance by subject
- browse report pages
3. Each row shows:
- date
- subject
- status
- notes

#### G. Fees flow

1. Parent opens `Fees`.
2. Parent can view:
- fee name
- amount
- due date
- payment status
- paid date
- notes
3. This helps the parent monitor unpaid and paid class fees.

#### H. Settings and sign out

1. Parent opens `Settings`.
2. Parent can view account details and change theme.
3. Parent signs out from the sidebar.

---

## Short summary by role

- Admin manages the whole system.
- Teacher manages advisory students, subjects, attendance, encoded grades, and fees.
- Student mainly views personal academic records and may request to join a section.
- Parent requests access, then monitors the child's performance, attendance, and fees.
