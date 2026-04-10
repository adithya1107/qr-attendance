# QR Attendance System

A full-featured QR code attendance tracking app for students and teachers, built with React + TypeScript + Vite + Supabase.

---

## Features

- **Teachers** – Generate QR codes per class session, view live attendance as students scan in, approve/reject location-failed attempts, edit attendance history
- **Students** – Scan QR codes or enter session codes, GPS-verified location check, view attendance stats per course
- Late penalty system (10 min window for full credit, after = 0.5x)
- Real-time updates every 3 seconds during active sessions
- Mobile-responsive (daily list on mobile, weekly timeline on desktop)

---

## Setup in 3 Steps

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Note your **Project URL** and **anon public key** (Settings → API)
3. Go to **SQL Editor** and run the entire contents of `supabase_schema.sql`

### Step 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3 — Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Usage

### First-time setup

1. **Register a teacher account** – choose role "Teacher", enter an Employee ID (e.g. `TCH001`)
2. **Register student accounts** – choose role "Student", enter Student IDs (e.g. `STU001`)
3. **In Supabase SQL Editor**, insert a course and enroll students:

```sql
-- Replace <teacher-user-id> with UUID from user_profiles table
INSERT INTO public.courses (course_name, course_code, instructor_id)
VALUES ('Computer Science 101', 'CS101', '<teacher-user-id>');

-- Copy the course id from the result, then:
INSERT INTO public.class_schedule (course_id, day_of_week, start_time, end_time, room_location)
VALUES ('<course-id>', 1, '09:00', '10:30', 'Room A101');
-- day_of_week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

-- Enroll a student:
INSERT INTO public.enrollments (student_id, course_id)
VALUES ('<student-user-id>', '<course-id>');
```

### Teacher workflow

1. Sign in → **Schedule tab** shows your weekly timetable
2. Click a class card (or tap on mobile) → app requests your GPS location, then generates a QR code + 6-char session code
3. Share the QR or code with students
4. **Live Attendance panel** updates in real time as students mark in
5. After class, edit any late/absent records directly in the dialog
6. **Attendance History tab** shows all past sessions with full edit capability

### Student workflow

1. Sign in → **Mark Attendance tab**
2. Enter the 6-char code OR tap **Scan QR Code** to use camera
3. App verifies GPS proximity to teacher (if teacher location was captured)
4. Status: **Present** if within 10 min of start, **Late** if after
5. If location fails, attempt is logged for teacher manual approval

---

## Project Structure

```
src/
├── components/
│   ├── ui/               # shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── shared/
│   │   ├── LoginPage.tsx  # Auth form (sign in + sign up)
│   │   └── Dashboard.tsx  # Role-based layout
│   ├── student/
│   │   └── AttendanceOverview.tsx
│   └── teacher/
│       └── TeacherSchedule.tsx
├── hooks/
│   └── useAuth.tsx        # Auth context + Supabase session
├── integrations/
│   └── supabase/
│       ├── client.ts      # Supabase client
│       └── types.ts       # Database type definitions
├── lib/
│   ├── locationUtils.ts   # GPS helpers (Haversine distance)
│   └── utils.ts           # cn() tailwind helper
├── App.tsx
├── main.tsx
└── index.css
```

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Vite + React + TypeScript | Frontend framework |
| Tailwind CSS | Styling |
| shadcn/ui (Radix) | UI components |
| Supabase | Auth, database, real-time |
| qrcode | QR code image generation (teacher) |
| qr-scanner | Camera QR scanning (student) |
| sonner | Toast notifications |
| lucide-react | Icons |

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

---

## Notes

- **Location verification** is optional — if the teacher's GPS fails, attendance still works without proximity checking
- **RLS** (Row Level Security) is enabled on all tables; students only see their own data
- The QR session code auto-expires when the class `end_time` is reached and marks remaining students absent
- GPS adaptive radius accounts for combined teacher + student GPS accuracy (max 100m)
