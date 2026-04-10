-- ============================================================
-- QR ATTENDANCE SYSTEM - SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. USER PROFILES
create table if not exists public.user_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  first_name text not null,
  last_name text not null,
  email text not null,
  role text not null check (role in ('student', 'teacher', 'admin')),
  user_code text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. COURSES
create table if not exists public.courses (
  id uuid default gen_random_uuid() primary key,
  course_name text not null,
  course_code text not null unique,
  instructor_id uuid references public.user_profiles(user_id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 3. ENROLLMENTS
create table if not exists public.enrollments (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.user_profiles(user_id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  status text not null default 'enrolled' check (status in ('enrolled', 'dropped', 'completed')),
  created_at timestamptz default now(),
  unique(student_id, course_id)
);

-- 4. REGULAR CLASS SCHEDULE (recurring weekly)
create table if not exists public.class_schedule (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Sun, 6=Sat
  start_time time not null,
  end_time time not null,
  room_location text,
  created_at timestamptz default now()
);

-- 5. EXTRA / ONE-OFF CLASS SCHEDULE
create table if not exists public.extra_class_schedule (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  teacher_id uuid references public.user_profiles(user_id) on delete cascade not null,
  title text not null,
  description text,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  room_location text,
  class_type text not null default 'extra' check (class_type in ('extra', 'remedial', 'makeup', 'special')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz default now()
);

-- 6. ATTENDANCE SESSIONS (one per class meeting)
create table if not exists public.attendance_sessions (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  instructor_id uuid references public.user_profiles(user_id) on delete set null,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  session_type text not null default 'lecture',
  topic text,
  qr_code text not null,
  is_active boolean default true,
  room_location text,
  teacher_latitude double precision,
  teacher_longitude double precision,
  created_at timestamptz default now(),
  unique(course_id, session_date, start_time, instructor_id)
);

-- 7. ATTENDANCE RECORDS
create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  student_id uuid references public.user_profiles(user_id) on delete cascade not null,
  class_date date not null,
  status text not null check (status in ('present', 'late', 'absent')),
  session_id uuid references public.attendance_sessions(id) on delete cascade,
  marked_by uuid references public.user_profiles(user_id) on delete set null,
  marked_at timestamptz default now(),
  device_info jsonb,
  student_latitude double precision,
  student_longitude double precision,
  distance_from_teacher double precision,
  created_at timestamptz default now(),
  unique(session_id, student_id)
);

-- 8. ATTENDANCE ATTEMPTS (failed location verifications)
create table if not exists public.attendance_attempts (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.attendance_sessions(id) on delete cascade not null,
  student_id uuid references public.user_profiles(user_id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  failure_reason text,
  student_latitude double precision,
  student_longitude double precision,
  distance_from_teacher double precision,
  gps_accuracy double precision,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.user_profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  attempted_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.user_profiles enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.class_schedule enable row level security;
alter table public.extra_class_schedule enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_attempts enable row level security;

-- USER PROFILES policies
create policy "Users can view their own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id);

create policy "Allow insert during signup"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

-- Allow users to see other profiles (needed for attendance display)
create policy "Authenticated users can view all profiles"
  on public.user_profiles for select
  using (auth.role() = 'authenticated');

-- COURSES policies
create policy "Everyone can view active courses"
  on public.courses for select
  using (is_active = true);

create policy "Teachers can manage their own courses"
  on public.courses for all
  using (instructor_id = auth.uid());

-- ENROLLMENTS policies
create policy "Students can view their own enrollments"
  on public.enrollments for select
  using (student_id = auth.uid());

create policy "Teachers can view enrollments for their courses"
  on public.enrollments for select
  using (
    course_id in (select id from public.courses where instructor_id = auth.uid())
  );

create policy "Admins can manage all enrollments"
  on public.enrollments for all
  using (
    auth.uid() in (select user_id from public.user_profiles where role = 'admin')
  );

-- CLASS SCHEDULE policies
create policy "Authenticated users can view schedules"
  on public.class_schedule for select
  using (auth.role() = 'authenticated');

create policy "Teachers can manage their course schedules"
  on public.class_schedule for all
  using (
    course_id in (select id from public.courses where instructor_id = auth.uid())
  );

-- EXTRA CLASS SCHEDULE policies
create policy "Authenticated users can view extra classes"
  on public.extra_class_schedule for select
  using (auth.role() = 'authenticated');

create policy "Teachers can manage their own extra classes"
  on public.extra_class_schedule for all
  using (teacher_id = auth.uid());

-- ATTENDANCE SESSIONS policies
create policy "Authenticated users can view sessions"
  on public.attendance_sessions for select
  using (auth.role() = 'authenticated');

create policy "Teachers can manage their own sessions"
  on public.attendance_sessions for all
  using (instructor_id = auth.uid());

-- ATTENDANCE policies
create policy "Students can view their own attendance"
  on public.attendance for select
  using (student_id = auth.uid());

create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (student_id = auth.uid());

create policy "Teachers can view attendance for their courses"
  on public.attendance for select
  using (
    course_id in (select id from public.courses where instructor_id = auth.uid())
  );

create policy "Teachers can update attendance for their courses"
  on public.attendance for update
  using (
    course_id in (select id from public.courses where instructor_id = auth.uid())
  );

create policy "Teachers can insert attendance for their courses"
  on public.attendance for insert
  with check (
    course_id in (select id from public.courses where instructor_id = auth.uid())
  );

-- ATTENDANCE ATTEMPTS policies
create policy "Students can insert their own attempts"
  on public.attendance_attempts for insert
  with check (student_id = auth.uid());

create policy "Students can view their own attempts"
  on public.attendance_attempts for select
  using (student_id = auth.uid());

create policy "Teachers can view attempts for their sessions"
  on public.attendance_attempts for select
  using (
    session_id in (
      select id from public.attendance_sessions where instructor_id = auth.uid()
    )
  );

create policy "Teachers can update attempts for their sessions"
  on public.attendance_attempts for update
  using (
    session_id in (
      select id from public.attendance_sessions where instructor_id = auth.uid()
    )
  );

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index if not exists idx_attendance_student on public.attendance(student_id);
create index if not exists idx_attendance_course on public.attendance(course_id);
create index if not exists idx_attendance_session on public.attendance(session_id);
create index if not exists idx_attendance_date on public.attendance(class_date);
create index if not exists idx_attendance_sessions_course on public.attendance_sessions(course_id);
create index if not exists idx_attendance_sessions_date on public.attendance_sessions(session_date);
create index if not exists idx_attendance_sessions_active on public.attendance_sessions(is_active);
create index if not exists idx_enrollments_student on public.enrollments(student_id);
create index if not exists idx_enrollments_course on public.enrollments(course_id);
create index if not exists idx_attempts_session on public.attendance_attempts(session_id);
create index if not exists idx_attempts_student on public.attendance_attempts(student_id);
create index if not exists idx_attempts_status on public.attendance_attempts(status);

-- ============================================================
-- SAMPLE DATA (optional - remove if not needed)
-- ============================================================
-- After you create your own accounts, you can run:
--
-- INSERT INTO public.courses (course_name, course_code, instructor_id)
-- VALUES ('Computer Science 101', 'CS101', '<your-teacher-user-id>');
--
-- INSERT INTO public.class_schedule (course_id, day_of_week, start_time, end_time, room_location)
-- VALUES ('<course-id>', 1, '09:00', '10:00', 'Room A101');  -- Monday 9-10am
--
-- INSERT INTO public.enrollments (student_id, course_id)
-- VALUES ('<student-user-id>', '<course-id>');
