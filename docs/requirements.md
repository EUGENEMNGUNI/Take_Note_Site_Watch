# Site Watch — Software Requirements Specification

## 1. Project Overview

Site Watch is a digital employee attendance, site-presence verification, and leave management system intended to help an organisation manage employee attendance across its work sites.

The system aims to provide employees with a convenient way to record attendance and submit leave requests while enabling authorised administrators to monitor attendance, review requests, and access relevant reports.

## 2. Project Objectives

- Digitise employee check-in and check-out.
- Record employee attendance and working hours.
- Support verification of employee presence at authorised work sites.
- Provide administrators with an attendance dashboard.
- Allow employees to submit sick-leave requests and supporting documentation.
- Notify authorised administrators of relevant attendance issues.
- Maintain secure records of attendance, leave requests, and administrative actions.

## 3. User Roles

### 3.1 Employee

Employees should be able to:
- Sign in securely.
- Check in and check out.
- View their own attendance history.
- View relevant attendance information.
- Submit sick-leave requests.
- Upload supporting medical documentation where required.
- Communicate through the internal messaging functionality, if approved.

### 3.2 Administrator

Authorised administrators should be able to:
- Access the administrative dashboard.
- View employee attendance records within their authorised scope.
- Monitor attendance and potential irregularities.
- Review and process leave requests.
- View relevant site-presence information.
- Access authorised reports.
- Review audit records and perform permitted administrative actions.

## 4. Functional Requirements

### FR-01: Authentication
The system must provide secure user authentication and sign-out functionality.

### FR-02: Role-Based Access Control
The system must restrict pages, records, and actions according to the authenticated user's role and permissions.

### FR-03: Employee Check-In
Employees must be able to record their check-in time through the application.

### FR-04: Employee Check-Out
Employees must be able to record their check-out time, with attendance records linked to the relevant employee and work period.

### FR-05: Site-Presence Verification
The system should support the agreed method of verifying that an employee is present at an authorised work site.

Possible verification methods include company-network verification and location-radius checks. The final method, accuracy requirements, exceptions, and privacy safeguards must be agreed upon with the project supervisor.

### FR-06: Attendance Dashboard
Authorised administrators should be able to view relevant attendance information, including check-in and check-out records and potential attendance irregularities.

### FR-07: Attendance History
Employees should be able to view their own attendance history. Administrators should only access records permitted by their role.

### FR-08: Working-Hours Monitoring
The system should calculate recorded working hours using valid attendance timestamps and agreed organisational rules.

Rules for breaks, overtime, missed check-outs, and incomplete attendance records must be confirmed.

### FR-09: Attendance Alerts
The system should identify agreed attendance exceptions and make relevant alerts available to authorised administrators.

### FR-10: Leave Management
Employees should be able to submit sick-leave requests and view their request status.

### FR-11: Supporting Documents
The system should support secure uploads of required sick-leave documentation. Documents must not be publicly accessible.

### FR-12: Leave Review
Authorised administrators should be able to review requests and record their decisions.

### FR-13: Site Map
If approved, the application should provide a map-based view of authorised work sites and relevant site-presence information.

### FR-14: Internal Messaging
The system may provide internal messaging for approved employee and administrator communication.

### FR-15: Audit Logging
The system should record relevant security-sensitive and administrative actions to support accountability and troubleshooting.

## 5. Non-Functional Requirements

### Security
- Protect authentication credentials and confidential information.
- Enforce access controls on both the application and database.
- Use appropriate Supabase Row Level Security policies.
- Keep privileged credentials on the server.
- Restrict access to uploaded medical documents.

### Privacy
- Collect only the location and attendance information required by the agreed requirements.
- Clearly communicate when and why location verification is performed.
- Restrict access to employee location and medical information.
- Establish suitable retention and deletion rules.

### Usability
- Provide a clear and accessible user interface.
- Display understandable validation messages and error states.
- Support common desktop and mobile browser sizes.

### Reliability
- Handle failed requests and network interruptions gracefully.
- Prevent invalid or duplicate attendance records where possible.
- Preserve accurate timestamps and attendance history.

### Maintainability
- Use reusable components and clearly organised modules.
- Document the database schema and application setup.
- Use Git branches and code reviews for collaborative development.
- Provide repeatable testing procedures.

## 6. Proposed Technology Stack

- Frontend and application framework: Next.js
- Programming language: TypeScript
- Authentication and database services: Supabase
- Database: PostgreSQL through Supabase
- Version control: Git and GitHub
- Deployment: Vercel
- Mapping: Leaflet or another approved mapping solution, if required

## 7. Initial Project Scope

The initial implementation should prioritise the core attendance workflow, user authentication, role-based permissions, attendance records, and the administrator dashboard.

Leave management, secure document uploads, alerts, mapping, and messaging should be prioritised according to the agreed project timeline and supervisor's requirements.

Payroll integration, a full human-resources management system, facial recognition, and a standalone mobile application are outside the initial scope unless the project supervisor approves a change.

## 8. Acceptance Criteria

The initial system should be tested to establish that:

- Users can authenticate and sign out.
- Employees cannot access administrative functions without permission.
- Employees can record valid check-in and check-out events.
- Attendance records are associated with the correct employee.
- Employees cannot access another employee's restricted records.
- Administrators can access the attendance information permitted by their role.
- Leave requests and their decisions are recorded correctly.
- Sensitive documents are protected from unauthorised access.
- Invalid input and failed requests are handled appropriately.

## 9. Outstanding Decisions

The project team and supervisor must confirm:

- Final user roles and permissions.
- The approved site-presence verification method.
- Attendance schedules, breaks, overtime, and exception rules.
- Alert conditions and delivery channels.
- Leave approval rules and document-retention requirements.
- Whether mapping and internal messaging are mandatory.
- Reporting requirements and project acceptance criteria.
- Deployment ownership and environment configuration.

## 10. Document Status

Status: Working draft pending review and approval by the project team and supervisor.

This document records proposed requirements and must be updated as project decisions are confirmed.