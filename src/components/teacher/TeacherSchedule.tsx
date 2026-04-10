import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import QRCode from 'qrcode';
import { getCurrentLocation } from '@/lib/locationUtils';
import {
  Calendar, MapPin, Users, ChevronLeft, ChevronRight, Star,
  QrCode as QrCodeIcon, Copy, CheckCircle, Clock, Edit,
  AlertCircle, FileText, AlertTriangle, XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import EnrollmentManager from './EnrollmentManager';
import CourseManager from './CourseManager';
import TimetableManager from './TimetableManager';

interface TeacherScheduleProps {
  teacherData: {
    user_id: string;
    first_name: string;
    last_name: string;
    user_code: string;
  };
}

const TeacherSchedule: React.FC<TeacherScheduleProps> = ({ teacherData }) => {
  const [schedule, setSchedule] = useState<any[]>([]);
  const [todayClasses, setTodayClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [currentMobileDay, setCurrentMobileDay] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [courseAttendanceStats, setCourseAttendanceStats] = useState<any[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [canGenerateQR, setCanGenerateQR] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [minutesSinceStart, setMinutesSinceStart] = useState<number>(0);
  const [teacherCourseIds, setTeacherCourseIds] = useState<string[]>([]);
  const [hoveredClass, setHoveredClass] = useState<any>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number; showBelow?: boolean } | null>(null);
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = React.useRef<boolean>(false);
  const [failedAttempts, setFailedAttempts] = useState<any[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState<any>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [loadingHistory, setLoadingHistory] = useState(false);

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'];

  useEffect(() => {
    if (teacherData?.user_id) fetchTeacherCourses();
  }, [teacherData]);

  useEffect(() => {
    if (teacherData?.user_id) fetchScheduleData();
  }, [teacherData, currentWeek, currentMobileDay, teacherCourseIds]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isQRDialogOpen && currentSessionId) {
      fetchAttendanceForSession();
      fetchFailedAttempts();
      interval = setInterval(() => { fetchAttendanceForSession(); fetchFailedAttempts(); }, 3000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isQRDialogOpen, currentSessionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isQRDialogOpen && selectedClass) checkTimeValidity(selectedClass);
    }, 1000);
    return () => clearInterval(interval);
  }, [isQRDialogOpen, selectedClass]);

  useEffect(() => {
    if (teacherData?.user_id && teacherCourseIds.length > 0) fetchPastSessions();
  }, [teacherData, teacherCourseIds, selectedCourseFilter]);

  const timeToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const generateSessionCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const checkTimeValidity = (classData: any) => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    if (currentTime >= classData.start_time && currentTime <= classData.end_time) {
      const [sh, sm] = classData.start_time.split(':').map(Number);
      const startDate = new Date(); startDate.setHours(sh, sm, 0, 0);
      const elapsed = Math.floor((now.getTime() - startDate.getTime()) / 60000);
      setMinutesSinceStart(elapsed);
      const [eh, em] = classData.end_time.split(':').map(Number);
      const endDate = new Date(); endDate.setHours(eh, em, 0, 0);
      setTimeRemaining(Math.floor((endDate.getTime() - now.getTime()) / 60000));
      setCanGenerateQR(true);
    } else { setCanGenerateQR(false); setTimeRemaining(0); setMinutesSinceStart(0); }
  };

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchWeeklySchedule(), fetchTodayClasses()]);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchTeacherCourses = async () => {
    try {
      const { data, error } = await supabase.from('courses').select('id,course_name,course_code').eq('instructor_id', teacherData.user_id).eq('is_active', true);
      if (error) throw error;
      if (data) { setCourses(data); setTeacherCourseIds(data.map((c: any) => c.id)); }
    } catch (err) { console.error(err); toast.error('Failed to fetch your courses'); }
  };

  const fetchWeeklySchedule = async () => {
    try {
      if (teacherCourseIds.length === 0) { setSchedule([]); return; }
      const { data: regularSchedule, error } = await supabase
        .from('class_schedule')
        .select(`*, courses(id,course_name,course_code,instructor_id,enrollments(count))`)
        .in('course_id', teacherCourseIds);
      if (error) throw error;
      let allData: any[] = (regularSchedule || [])
        .filter((s: any) => s.courses?.instructor_id === teacherData.user_id)
        .map((s: any) => ({ ...s, is_extra_class: false, class_type: 'regular' }));

      const weekStart = new Date(currentWeek); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      const mobileStart = new Date(currentMobileDay); mobileStart.setDate(mobileStart.getDate() - 3);
      const mobileEnd = new Date(currentMobileDay); mobileEnd.setDate(mobileEnd.getDate() + 3);
      const earliestDate = weekStart < mobileStart ? weekStart : mobileStart;
      const latestDate = weekEnd > mobileEnd ? weekEnd : mobileEnd;

      const { data: extraClasses } = await supabase
        .from('extra_class_schedule')
        .select(`id,course_id,teacher_id,title,description,scheduled_date,start_time,end_time,room_location,class_type,status,courses(course_name,course_code,instructor_id)`)
        .eq('teacher_id', teacherData.user_id).eq('status', 'scheduled')
        .gte('scheduled_date', earliestDate.toISOString().split('T')[0])
        .lte('scheduled_date', latestDate.toISOString().split('T')[0]);

      if (extraClasses) {
        allData = [...allData, ...extraClasses.map((ec: any) => ({
          id: ec.id, day_of_week: new Date(ec.scheduled_date).getDay(), scheduled_date: ec.scheduled_date,
          start_time: ec.start_time, end_time: ec.end_time, room_location: ec.room_location || '',
          course_id: ec.course_id, class_type: ec.class_type, title: ec.title, is_extra_class: true,
          courses: { id: ec.course_id, course_name: ec.courses?.course_name || ec.title, course_code: ec.courses?.course_code || 'EXTRA', instructor_id: ec.teacher_id, enrollments: [] },
        }))];
      }
      setSchedule(allData);
    } catch (err) { console.error(err); }
  };

  const fetchTodayClasses = async () => {
    const today = new Date();
    const todayDay = today.getDay();
    const todayString = today.toISOString().split('T')[0];
    try {
      if (teacherCourseIds.length === 0) { setTodayClasses([]); return; }
      const { data: regularClasses } = await supabase
        .from('class_schedule')
        .select(`*, courses(id,course_name,course_code,instructor_id,enrollments(count))`)
        .in('course_id', teacherCourseIds).eq('day_of_week', todayDay);

      let all: any[] = ((regularClasses || []).filter((c: any) => c.courses?.instructor_id === teacherData.user_id)
        .map((c: any) => ({ ...c, is_extra_class: false, class_type: 'regular' })));

      const { data: extraClasses } = await supabase
        .from('extra_class_schedule')
        .select(`id,course_id,teacher_id,title,description,scheduled_date,start_time,end_time,room_location,class_type,status,courses(course_name,course_code,instructor_id)`)
        .eq('teacher_id', teacherData.user_id).eq('status', 'scheduled').eq('scheduled_date', todayString);

      if (extraClasses) {
        all = [...all, ...extraClasses.map((ec: any) => ({
          id: ec.id, day_of_week: todayDay, scheduled_date: ec.scheduled_date, start_time: ec.start_time,
          end_time: ec.end_time, room_location: ec.room_location || '', course_id: ec.course_id,
          class_type: ec.class_type, title: ec.title, is_extra_class: true,
          courses: { id: ec.course_id, course_name: ec.courses?.course_name || ec.title, course_code: ec.courses?.course_code || 'EXTRA', instructor_id: ec.teacher_id, enrollments: [] },
        }))];
      }
      setTodayClasses(all.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    } catch (err) { console.error(err); }
  };

  const fetchFailedAttempts = async () => {
    if (!currentSessionId) return;
    await fetchFailedAttemptsForSession(currentSessionId);
  };

  const fetchFailedAttemptsForSession = async (sid: string) => {
    try {
      const { data, error } = await supabase
        .from('attendance_attempts')
        .select(`*, user_profiles!attendance_attempts_student_id_fkey(id,first_name,last_name,user_code)`)
        .eq('session_id', sid).eq('status', 'pending').order('attempted_at', { ascending: false });
      if (error) throw error;
      setFailedAttempts(data || []);
    } catch (err) { console.error(err); }
  };

  const approveFailedAttempt = async (attempt: any) => {
    try {
      const [sh, sm] = selectedClass.start_time.split(':').map(Number);
      const startDate = new Date(); startDate.setHours(sh, sm, 0, 0);
      const attemptTime = new Date(attempt.attempted_at);
      const elapsed = Math.floor((attemptTime.getTime() - startDate.getTime()) / 60000);
      const status = elapsed > 10 ? 'late' : 'present';

      const { error: ae } = await supabase.from('attendance').insert({
        course_id: attempt.course_id, student_id: attempt.student_id,
        class_date: selectedClass.scheduled_date || new Date().toISOString().split('T')[0],
        status, session_id: attempt.session_id, marked_by: teacherData.user_id, marked_at: new Date().toISOString(),
        device_info: { approved_from_failed_attempt: true, original_attempt_time: attempt.attempted_at, failure_reason: attempt.failure_reason },
        student_latitude: attempt.student_latitude, student_longitude: attempt.student_longitude,
        distance_from_teacher: attempt.distance_from_teacher,
      });
      if (ae) throw ae;

      await supabase.from('attendance_attempts').update({ status: 'approved', reviewed_by: teacherData.user_id, reviewed_at: new Date().toISOString() }).eq('id', attempt.id);
      toast.success('Attendance approved successfully');
      fetchAttendanceForSession();
      fetchFailedAttempts();
    } catch (err) { console.error(err); toast.error('Failed to approve attendance'); }
  };

  const rejectFailedAttempt = async (attemptId: string) => {
    try {
      await supabase.from('attendance_attempts').update({ status: 'rejected', reviewed_by: teacherData.user_id, reviewed_at: new Date().toISOString() }).eq('id', attemptId);
      toast.success('Attempt rejected');
      fetchFailedAttempts();
    } catch (err) { console.error(err); toast.error('Failed to reject attempt'); }
  };

  const generateQRCode = async (classData: any) => {
    try {
      if (!teacherCourseIds.includes(classData.course_id)) { toast.error('Not authorized for this course'); return; }
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      if (currentTime < classData.start_time) { toast.error('Cannot generate QR code before class starts'); return; }
      if (currentTime > classData.end_time) { toast.error('Class has already ended'); return; }

      let teacherLocation: { latitude: number; longitude: number } | null = null;
      try {
        teacherLocation = await getCurrentLocation();
        toast.success('📍 Location captured for attendance verification');
      } catch (locErr: any) {
        toast.error(locErr.message || 'Location unavailable. Attendance will work without location verification.');
      }

      const today = new Date().toISOString().split('T')[0];
      const sessionDate = classData.scheduled_date || today;

      const { data: existingSession } = await supabase.from('attendance_sessions').select('id,qr_code,is_active')
        .eq('course_id', classData.course_id).eq('session_date', sessionDate)
        .eq('start_time', classData.start_time).eq('instructor_id', teacherData.user_id).single();

      let session: any;
      let qrCodeData: string;

      if (existingSession) {
        session = existingSession;
        qrCodeData = existingSession.qr_code;
        const updateData: any = { is_active: true };
        if (teacherLocation) { updateData.teacher_latitude = teacherLocation.latitude; updateData.teacher_longitude = teacherLocation.longitude; }
        await supabase.from('attendance_sessions').update(updateData).eq('id', existingSession.id);
        toast.info('Reopening existing session');
      } else {
        let sessionCode = '';
        let isUnique = false;
        while (!isUnique) {
          sessionCode = generateSessionCode();
          const { data: existing } = await supabase.from('attendance_sessions').select('id').eq('qr_code', sessionCode).eq('session_date', sessionDate).single();
          if (!existing) isUnique = true;
        }
        const sessionData: any = {
          course_id: classData.course_id, instructor_id: teacherData.user_id, session_date: sessionDate,
          start_time: classData.start_time, end_time: classData.end_time,
          session_type: classData.is_extra_class ? classData.class_type : 'lecture',
          topic: classData.title || classData.courses?.course_name, qr_code: sessionCode, is_active: true,
          room_location: classData.room_location,
        };
        if (teacherLocation) { sessionData.teacher_latitude = teacherLocation.latitude; sessionData.teacher_longitude = teacherLocation.longitude; }
        const { data: newSession, error: se } = await supabase.from('attendance_sessions').insert(sessionData).select().single();
        if (se) throw se;
        qrCodeData = sessionCode;
        session = newSession;
        toast.success(teacherLocation ? '✅ QR Code generated with location verification!' : 'QR Code generated (no location)');
      }

      setSelectedClass(classData);
      setCurrentSessionId(session.id);
      const qrDataUrl = await QRCode.toDataURL(qrCodeData, { width: 300, margin: 2, color: { dark: '#3b82f6', light: '#ffffff' } });
      setQrCode(qrDataUrl);
      setSessionId(qrCodeData);
      setIsQRDialogOpen(true);
      setAttendanceRecords([]);
      setCourseAttendanceStats([]);
      checkTimeValidity(classData);
      setTimeout(() => fetchAttendanceForSession(), 500);

      const [eh, em] = classData.end_time.split(':').map(Number);
      const endDate = new Date(); endDate.setHours(eh, em, 0, 0);
      const remaining = endDate.getTime() - now.getTime();
      if (remaining > 0) setTimeout(() => closeSession(session.id, classData.course_id, sessionDate), remaining);
    } catch (err: any) { console.error(err); toast.error(err.message || 'Failed to generate QR code'); }
  };

  const closeSession = async (sid: string, courseId: string, sessionDate: string) => {
    try {
      await supabase.from('attendance_sessions').update({ is_active: false }).eq('id', sid);
      const { data: attended } = await supabase.from('attendance').select('student_id').eq('session_id', sid);
      const attendedIds = new Set((attended || []).map((a: any) => a.student_id));
      const { data: enrolled } = await supabase.from('enrollments').select('student_id').eq('course_id', courseId).eq('status', 'enrolled');
      const absentStudents = (enrolled || []).filter((e: any) => !attendedIds.has(e.student_id)).map((e: any) => ({
        course_id: courseId, student_id: e.student_id, class_date: sessionDate, status: 'absent',
        session_id: sid, marked_by: teacherData.user_id, marked_at: new Date().toISOString(),
      }));
      if (absentStudents.length > 0) await supabase.from('attendance').insert(absentStudents);
      if (isQRDialogOpen) { toast.info(`Session closed. ${absentStudents.length} students marked absent.`); await fetchAttendanceForSession(); }
    } catch (err) { console.error(err); }
  };

  const fetchAttendanceForSession = async () => {
    if (!currentSessionId || !selectedClass?.course_id) return;
    try {
      const { data: attendance, error: ae } = await supabase
        .from('attendance')
        .select(`student_id,status,marked_at,session_id,device_info,user_profiles!attendance_student_id_fkey(id,first_name,last_name,user_code)`)
        .eq('session_id', currentSessionId).order('marked_at', { ascending: false });
      if (ae) throw ae;

      const { data: allEnrolled, error: ee } = await supabase
        .from('enrollments')
        .select(`student_id,user_profiles!enrollments_student_id_fkey(id,first_name,last_name,user_code)`)
        .eq('course_id', selectedClass.course_id).eq('status', 'enrolled');
      if (ee) throw ee;

      const records = (allEnrolled || []).map((enr: any) => {
        const rec = (attendance || []).find((a: any) => a.student_id === enr.student_id);
        return { student_id: enr.student_id, user_profiles: enr.user_profiles, status: rec?.status || 'waiting', marked_at: rec?.marked_at || null, session_id: currentSessionId, device_info: rec?.device_info };
      });
      setAttendanceRecords(records);
      if (attendance && attendance.length > 0) await fetchCourseAttendanceStats(selectedClass.course_id, attendance);
    } catch (err) { console.error(err); }
  };

  const fetchCourseAttendanceStats = async (courseId: string, currentAttendance: any[]) => {
    try {
      const studentIds = currentAttendance.map((a: any) => a.student_id);
      if (!studentIds.length) return;
      const { data } = await supabase.from('attendance').select('student_id,status').eq('course_id', courseId).in('student_id', studentIds);
      if (data) {
        const map = new Map<string, { present: number; late: number; total: number }>();
        data.forEach((r: any) => {
          if (!map.has(r.student_id)) map.set(r.student_id, { present: 0, late: 0, total: 0 });
          const s = map.get(r.student_id)!; s.total++;
          if (r.status === 'present') s.present++;
          else if (r.status === 'late') s.late++;
        });
        setCourseAttendanceStats(Array.from(map.entries()).map(([sid, d]) => ({
          student_id: sid, present_count: d.present, late_count: d.late, total_count: d.total,
          percentage: d.total > 0 ? ((d.present + d.late * 0.5) / d.total * 100).toFixed(1) : '0.0',
        })));
      }
    } catch (err) { console.error(err); }
  };

  const updateStudentAttendance = async (studentId: string, newStatus: 'present' | 'late') => {
    if (!currentSessionId) return;
    try {
      const { data: existing } = await supabase.from('attendance').select('id,status').eq('session_id', currentSessionId).eq('student_id', studentId).single();
      if (!existing) return;
      const allowed: Record<string, string[]> = { late: ['present'], absent: ['late', 'present'] };
      if (!allowed[existing.status]?.includes(newStatus)) { toast.error('Invalid status transition'); return; }
      const { error } = await supabase.from('attendance').update({ status: newStatus, marked_by: teacherData.user_id, marked_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) throw error;
      toast.success(`Attendance updated to ${newStatus}`);
      await fetchAttendanceForSession();
      setEditingStudent(null);
    } catch (err) { console.error(err); toast.error('Failed to update attendance'); }
  };

  const fetchPastSessions = async () => {
    if (!teacherCourseIds.length) return;
    try {
      setLoadingHistory(true);
      let query = supabase.from('attendance_sessions').select(`*, courses(id,course_name,course_code)`)
        .eq('instructor_id', teacherData.user_id).order('session_date', { ascending: false }).order('start_time', { ascending: false }).limit(50);
      if (selectedCourseFilter !== 'all') query = query.eq('course_id', selectedCourseFilter);
      const { data: sessions, error } = await query;
      if (error) throw error;
      if (sessions) {
        const withStats = await Promise.all(sessions.map(async (s: any) => {
          const { data: att } = await supabase.from('attendance').select('status').eq('session_id', s.id);
          return {
            ...s,
            present_count: att?.filter((a: any) => a.status === 'present').length || 0,
            late_count: att?.filter((a: any) => a.status === 'late').length || 0,
            absent_count: att?.filter((a: any) => a.status === 'absent').length || 0,
            total_students: att?.length || 0,
          };
        }));
        setPastSessions(withStats);
      }
    } catch (err) { console.error(err); toast.error('Failed to load attendance history'); }
    finally { setLoadingHistory(false); }
  };

  const viewSessionDetails = async (session: any) => {
    setSelectedHistorySession(session);
    setCurrentSessionId(session.id);
    setHistoryDialogOpen(true);
    await fetchAttendanceForHistorySession(session.id, session.course_id);
  };

  const fetchAttendanceForHistorySession = async (sid: string, courseId: string) => {
    try {
      const { data: attendance } = await supabase.from('attendance')
        .select(`student_id,status,marked_at,marked_by,session_id,device_info,user_profiles!attendance_student_id_fkey(id,first_name,last_name,user_code)`)
        .eq('session_id', sid).order('marked_at', { ascending: false });
      const { data: allEnrolled } = await supabase.from('enrollments')
        .select(`student_id,user_profiles!enrollments_student_id_fkey(id,first_name,last_name,user_code)`)
        .eq('course_id', courseId).eq('status', 'enrolled');
      const records = (allEnrolled || []).map((enr: any) => {
        const rec = (attendance || []).find((a: any) => a.student_id === enr.student_id);
        return { student_id: enr.student_id, user_profiles: enr.user_profiles, status: rec?.status || 'absent', marked_at: rec?.marked_at || null, marked_by: rec?.marked_by || null, session_id: sid, device_info: rec?.device_info };
      });
      setAttendanceRecords(records);
      await fetchFailedAttemptsForSession(sid);
      if (attendance && attendance.length > 0) await fetchCourseAttendanceStats(courseId, attendance);
    } catch (err) { console.error(err); }
  };

  const getAttendancePercentage = (sid: string) => {
    const s = courseAttendanceStats.find(s => s.student_id === sid);
    return s ? s.percentage : '0.0';
  };
  const getAttendanceColor = (pct: string) => { const p = parseFloat(pct); return p >= 75 ? 'text-green-600' : p >= 60 ? 'text-yellow-600' : 'text-red-600'; };
  const getStatusColor = (status: string) => {
    if (status === 'present') return 'border-green-300 text-green-700';
    if (status === 'late') return 'border-yellow-300 text-yellow-700';
    if (status === 'absent') return 'border-red-300 text-red-700';
    return 'border-gray-300 text-gray-700';
  };
  const copySessionId = () => { navigator.clipboard.writeText(sessionId); setCopiedSessionId(true); toast.success('Copied!'); setTimeout(() => setCopiedSessionId(false), 2000); };
  const getWeekDays = (start: Date) => {
    const week = []; const s = new Date(start); s.setDate(s.getDate() - s.getDay());
    for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); week.push(d); }
    return week;
  };
  const navigateWeek = (dir: 'prev' | 'next') => { const d = new Date(currentWeek); d.setDate(d.getDate() + (dir === 'next' ? 7 : -7)); setCurrentWeek(d); };
  const navigateMobileDay = (dir: 'prev' | 'next') => { const d = new Date(currentMobileDay); d.setDate(d.getDate() + (dir === 'next' ? 1 : -1)); setCurrentMobileDay(d); };
  const formatTime = (t: string) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };
  const formatTimeShort = (t: string) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m}${hr >= 12 ? 'PM' : 'AM'}`; };
  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
  const isClassActive = (c: any) => { const ct = new Date().toTimeString().slice(0, 5); return ct >= c.start_time && ct <= c.end_time; };
  const canGenerateQRForClass = (c: any) => { const ct = new Date().toTimeString().slice(0, 5); return teacherCourseIds.includes(c.course_id) && ct >= c.start_time && ct <= c.end_time; };
  const getClassesForDay = (dayOfWeek: number, specificDate?: Date) =>
    schedule.filter(c => c.is_extra_class && c.scheduled_date && specificDate
      ? new Date(c.scheduled_date).toDateString() === specificDate.toDateString()
      : c.day_of_week === dayOfWeek);
  const getClassPosition = (start: string, end: string) => {
    const total = 24 * 60;
    const s = timeToMinutes(start); const e = timeToMinutes(end);
    return { top: `${(s / total) * 100}%`, height: `${Math.max(3, ((e - s) / total) * 100)}%`, durationMinutes: e - s };
  };
  const generateTimeLabels = () => Array.from({ length: 25 }, (_, i) => ({ time: `${String(i).padStart(2, '0')}:00`, display: formatTime(`${String(i).padStart(2, '0')}:00`) }));
  const getClassTypeStyle = (c: any) => {
    if (!c.is_extra_class) return 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20';
    const styles: Record<string, string> = { extra: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100', remedial: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100', makeup: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100', special: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' };
    return styles[c.class_type] || styles.extra;
  };

  const handleClassHover = (cls: any, e: React.MouseEvent) => {
    isHoveringRef.current = true;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    let x = rect.left + rect.width / 2;
    x = Math.max(170, Math.min(x, vw - 170));
    const showBelow = rect.top < 260;
    setHoveredClass(cls);
    setHoverPosition({ x, y: showBelow ? rect.bottom : rect.top, showBelow });
  };
  const handleClassLeave = () => {
    isHoveringRef.current = false;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => { if (!isHoveringRef.current) { setHoveredClass(null); setHoverPosition(null); } }, 200);
  };

  const detectOverlaps = (classes: any[]) => {
    const sorted = [...classes].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    const overlaps: any[][] = [];
    for (let i = 0; i < sorted.length; i++) {
      const group = [sorted[i]];
      const endMin = timeToMinutes(sorted[i].end_time);
      for (let j = i + 1; j < sorted.length; j++) if (timeToMinutes(sorted[j].start_time) < endMin) group.push(sorted[j]);
      if (group.length > 1) overlaps.push(group);
    }
    return overlaps;
  };
  const calculateOverlapPositions = (classes: any[]) => {
    const positions = new Map();
    detectOverlaps(classes).forEach(group => group.forEach((c, i) => positions.set(c, { totalInGroup: group.length, position: i })));
    return positions;
  };

  const hasNoCourses = courses.length === 0 && !loading;

  if (loading && courses.length === 0) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}</div>;
  }

  const AttendanceList = ({ records, isHistory = false }: { records: any[]; isHistory?: boolean }) => {
    return (
    <div className="max-h-96 overflow-y-auto space-y-2">
      {records.length === 0 ? <p className="text-center text-muted-foreground py-4">Loading...</p> :
        records.map((record, i) => {
          const pct = getAttendancePercentage(record.student_id);
          const isMarked = record.status !== 'waiting';
          return (
            <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${isMarked ? getStatusColor(record.status) : 'border-muted bg-background'}`}>
              <div className="flex-1">
                <p className="font-medium text-sm">{record.user_profiles?.first_name} {record.user_profiles?.last_name}</p>
                <p className="text-xs text-muted-foreground">ID: {record.user_profiles?.user_code}</p>
                {isHistory && record.marked_at && <p className="text-xs text-muted-foreground mt-1">Marked: {new Date(record.marked_at).toLocaleString()}</p>}
                {!isHistory && isMarked && <p className="text-xs text-muted-foreground">{new Date(record.marked_at).toLocaleTimeString()}</p>}
              </div>
              <div className="flex items-center gap-2">
                {isMarked ? (
                  <>
                    <Badge variant="outline" className="text-xs capitalize">{record.status}{record.status === 'late' && ' (0.5x)'}</Badge>
                    <span className={`text-xs font-semibold ${getAttendanceColor(pct)}`}>{pct}%</span>
                    {record.status === 'present' ? (
                      <Badge variant="outline"><CheckCircle className="h-3 w-3 mr-1" />Confirmed</Badge>
                    ) : record.status === 'late' ? (
                      editingStudent === record.student_id ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => updateStudentAttendance(record.student_id, 'present')} className="h-7 bg-green-50 border-green-300"><CheckCircle className="h-3 w-3 mr-1" />Present</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingStudent(null)} className="h-7">Cancel</Button>
                        </div>
                      ) : <Button size="sm" variant="outline" onClick={() => setEditingStudent(record.student_id)} className="h-7"><Edit className="h-3 w-3 mr-1" />Edit</Button>
                    ) : record.status === 'absent' ? (
                      editingStudent === record.student_id ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => updateStudentAttendance(record.student_id, 'late')} className="h-7 bg-yellow-50 border-yellow-300"><AlertTriangle className="h-3 w-3 mr-1" />Late</Button>
                          <Button size="sm" variant="outline" onClick={() => updateStudentAttendance(record.student_id, 'present')} className="h-7 bg-green-50 border-green-300"><CheckCircle className="h-3 w-3 mr-1" />Present</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingStudent(null)} className="h-7">Cancel</Button>
                        </div>
                      ) : <Button size="sm" variant="outline" onClick={() => setEditingStudent(record.student_id)} className="h-7"><Edit className="h-3 w-3 mr-1" />Edit</Button>
                    ) : null}
                  </>
                ) : <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300">Waiting...</Badge>}
              </div>
            </div>
          );
        })}
    </div>
    );
  };

  return (
    <div className="space-y-6 relative">
      {hasNoCourses && (
        <Alert><AlertCircle className="h-4 w-4 text-blue-600" /><AlertDescription>You don't have any courses assigned yet.</AlertDescription></Alert>
      )}

      {hoveredClass && hoverPosition && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: `${hoverPosition.x}px`, top: `${hoverPosition.y}px`, transform: hoverPosition.showBelow ? 'translate(-50%, 15px)' : 'translate(-50%, calc(-100% - 10px))' }}>
          <div className="bg-black border border-primary shadow-xl rounded-lg p-3 w-72 space-y-2">
            <div className="flex items-center gap-2">
              {hoveredClass.is_extra_class && <Star className="h-4 w-4 text-primary" />}
              <h4 className="font-bold text-sm text-primary truncate">{hoveredClass.courses?.course_code}</h4>
              {isClassActive(hoveredClass) && <Badge variant="default" className="text-xs">Active</Badge>}
            </div>
            <p className="text-sm font-medium text-white line-clamp-2">{hoveredClass.courses?.course_name}</p>
            <div className="space-y-1 text-xs text-gray-400">
              <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(hoveredClass.start_time)} - {formatTime(hoveredClass.end_time)}</div>
              <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{hoveredClass.room_location || 'Room TBD'}</div>
            </div>
            <div className="pt-1 border-t border-gray-700 text-xs text-gray-500 flex items-center gap-1"><QrCodeIcon className="h-3 w-3" />Click to generate QR</div>
          </div>
        </div>
      )}

      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="history">Attendance History</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          {/* QR Dialog */}
          <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] mt-2 overflow-y-auto">
              <DialogHeader><DialogTitle>Attendance Session – {selectedClass?.courses?.course_name}</DialogTitle></DialogHeader>
              <div className="space-y-6">
                {!canGenerateQR ? (
                  <Alert><Clock className="h-4 w-4" /><AlertDescription>Class has ended. Session is now closed.</AlertDescription></Alert>
                ) : (
                  <Alert><CheckCircle className="h-4 w-4" /><AlertDescription>
                    Session active • {timeRemaining} min remaining • {minutesSinceStart <= 10 ? `${10 - minutesSinceStart} min left for full credit` : 'Late period (0.5x credit)'}
                  </AlertDescription></Alert>
                )}
                <div className="flex flex-col items-center gap-4 p-6 bg-muted/50 rounded-lg">
                  <div className="p-4 rounded-lg shadow-md bg-white">{qrCode && <img src={qrCode} alt="QR Code" className="w-56 h-56 sm:w-72 sm:h-72" />}</div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium">Session Code: <span className="font-mono text-primary text-2xl font-bold tracking-wider">{sessionId}</span></p>
                    <p className="text-xs text-muted-foreground">Students can scan QR or enter this 6-character code</p>
                    <div className="flex items-center justify-center gap-2 text-xs"><AlertCircle className="h-3 w-3" /><span>First 10 min = Present | After 10 min = Late (0.5x)</span></div>
                    <Button variant="outline" size="sm" onClick={copySessionId}>
                      {copiedSessionId ? <><CheckCircle className="h-4 w-4 mr-2" />Copied!</> : <><Copy className="h-4 w-4 mr-2" />Copy Code</>}
                    </Button>
                  </div>
                </div>

                {failedAttempts.length > 0 && (
                  <div className="border-2 rounded-lg p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Pending Approvals ({failedAttempts.length})</h3>
                    <div className="space-y-3">
                      {failedAttempts.map((attempt: any) => (
                        <div key={attempt.id} className="flex flex-col sm:flex-row items-start justify-between p-3 rounded-lg border-2 gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{attempt.user_profiles?.first_name} {attempt.user_profiles?.last_name}</p>
                            <p className="text-xs text-muted-foreground">ID: {attempt.user_profiles?.user_code}</p>
                            <p className="text-xs mt-1">{attempt.failure_reason}</p>
                            {attempt.gps_accuracy && <p className="text-xs text-muted-foreground">GPS Accuracy: ±{Math.round(attempt.gps_accuracy)}m</p>}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => approveFailedAttempt(attempt)}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => rejectFailedAttempt(attempt.id)} className="border-red-300 text-red-700"><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-5 w-5" />Live Attendance ({attendanceRecords.filter(r => r.status === 'present' || r.status === 'late').length} / {attendanceRecords.length})</h3>
                  <AttendanceList records={attendanceRecords} />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Weekly Schedule Card */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /><span className="hidden lg:inline">Weekly Schedule Timeline</span><span className="lg:hidden">Daily Schedule</span></CardTitle>
                <div className="hidden lg:flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm font-medium min-w-[140px] text-center">{currentWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}><ChevronRight className="h-4 w-4" /></Button>
                </div>
                <div className="flex lg:hidden items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigateMobileDay('prev')}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-xs font-medium min-w-[140px] text-center">{currentMobileDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <Button variant="outline" size="sm" onClick={() => navigateMobileDay('next')}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden">
              {hasNoCourses ? (
                <div className="text-center py-12 text-muted-foreground"><Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No Schedule Available</p></div>
              ) : (
                <>
                  {/* Desktop Timeline */}
                  <div className="hidden lg:grid grid-cols-8 gap-2 min-h-[800px]">
                    <div className="space-y-0 relative">
                      <div className="h-12" />
                      <div className="relative" style={{ height: 'calc(100% - 48px)' }}>
                        {generateTimeLabels().map((label, i) => (
                          <div key={label.time} className="absolute text-xs text-muted-foreground w-full pr-2 text-right" style={{ top: `${(i / 24) * 100}%`, transform: 'translateY(-50%)' }}>{label.display}</div>
                        ))}
                      </div>
                    </div>
                    {getWeekDays(currentWeek).map((date, dayIndex) => {
                      const dayClasses = getClassesForDay(dayIndex, date);
                      const overlapPositions = calculateOverlapPositions(dayClasses);
                      return (
                        <div key={dayIndex} className="space-y-2">
                          <div className={`h-12 text-center p-2 rounded-lg ${isToday(date) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                            <div className="text-sm font-medium">{daysOfWeek[dayIndex]}</div>
                            <div className="text-xs">{date.getDate()}</div>
                          </div>
                          <div className="relative border rounded-lg overflow-hidden" style={{ height: 'calc(100% - 56px)', minHeight: '700px' }}>
                            {generateTimeLabels().map((_, i) => (
                              <div key={i} className="absolute w-full border-t border-muted" style={{ top: `${(i / 24) * 100}%` }} />
                            ))}
                            {dayClasses.map((cls, ci) => {
                              const pos = getClassPosition(cls.start_time, cls.end_time);
                              const active = isClassActive(cls);
                              const overlapInfo = overlapPositions.get(cls);
                              const w = overlapInfo ? 100 / overlapInfo.totalInGroup : 100;
                              const l = overlapInfo ? w * overlapInfo.position : 0;
                              return (
                                <div key={ci} className={`absolute p-1.5 rounded text-xs border cursor-pointer transition-colors ${getClassTypeStyle(cls)} ${active ? 'ring-2 ring-offset-1' : ''}`}
                                  style={{ top: pos.top, height: pos.height, left: `${l}%`, width: `${w - 1}%`, minHeight: '28px' }}
                                  onClick={() => generateQRCode(cls)}
                                  onMouseEnter={e => handleClassHover(cls, e)}
                                  onMouseLeave={handleClassLeave}>
                                  <div className="space-y-0.5 pointer-events-none">
                                    <div className="font-medium text-[10px] truncate flex items-center gap-0.5">
                                      {cls.is_extra_class && <Star className="h-2 w-2 flex-shrink-0" />}
                                      <span className="truncate">{cls.courses?.course_code}</span>
                                    </div>
                                    {pos.durationMinutes >= 30 && <div className="text-[9px] truncate">{formatTimeShort(cls.start_time)}</div>}
                                    {active && pos.durationMinutes >= 60 && <div className="text-[9px] font-semibold text-green-600">ACTIVE</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile List */}
                  <div className="lg:hidden space-y-3">
                    <div className={`p-4 rounded-lg ${isToday(currentMobileDay) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <div className="text-lg font-semibold">{currentMobileDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                      {isToday(currentMobileDay) && <div className="text-sm opacity-90 mt-1">Today</div>}
                    </div>
                    {(() => {
                      const dayClasses = getClassesForDay(currentMobileDay.getDay(), currentMobileDay);
                      if (!dayClasses.length) return <div className="text-center py-12 text-muted-foreground"><Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" /><p>No classes scheduled</p></div>;
                      return dayClasses.map((cls, i) => (
                        <div key={i} className={`p-4 rounded-lg border cursor-pointer ${getClassTypeStyle(cls)} ${isClassActive(cls) ? 'ring-2 ring-primary' : ''}`} onClick={() => generateQRCode(cls)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {cls.is_extra_class && <Star className="h-4 w-4" />}
                                <span className="font-bold text-base">{cls.courses?.course_code}</span>
                                {isClassActive(cls) && <Badge><Clock className="h-3 w-3 mr-1" />Active</Badge>}
                              </div>
                              <div className="text-sm font-medium mb-2">{cls.courses?.course_name}</div>
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-2"><Clock className="h-4 w-4 opacity-70" />{formatTime(cls.start_time)} – {formatTime(cls.end_time)}</div>
                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 opacity-70" />{cls.room_location || 'Room TBD'}</div>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1"><QrCodeIcon className="h-6 w-6 opacity-50" /><span className="text-xs opacity-70">Tap for QR</span></div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Today's Classes */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Today's Classes ({new Date().toLocaleDateString()})</CardTitle></CardHeader>
            <CardContent>
              {todayClasses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{hasNoCourses ? 'No courses assigned yet' : 'No classes scheduled for today'}</p>
              ) : (
                <div className="space-y-4">
                  {todayClasses.map((cls: any) => (
                    <Card key={cls.id} className={`p-4 ${isClassActive(cls) ? 'ring-2 ring-primary' : ''}`}>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="text-center">
                            <div className="text-lg font-bold text-primary">{formatTime(cls.start_time)}</div>
                            <div className="text-sm text-muted-foreground">{formatTime(cls.end_time)}</div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">{cls.courses?.course_name}</h3>
                              {cls.is_extra_class && <Badge variant="secondary" className="text-xs capitalize"><Star className="h-3 w-3 mr-1" />{cls.class_type}</Badge>}
                              {isClassActive(cls) && <Badge><Clock className="h-3 w-3 mr-1" />Active Now</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground">{cls.courses?.course_code}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{cls.room_location || 'Room TBD'}</div>
                            </div>
                          </div>
                        </div>
                        <Button onClick={() => generateQRCode(cls)} disabled={!canGenerateQRForClass(cls)}>
                          <QrCodeIcon className="h-4 w-4 mr-2" />{canGenerateQRForClass(cls) ? 'Generate QR' : 'Not Started'}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div><h2 className="text-xl font-bold">Attendance History</h2><p className="text-sm text-muted-foreground">View and edit past session attendance</p></div>
            <Select value={selectedCourseFilter} onValueChange={setSelectedCourseFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.course_code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : pastSessions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p className="font-medium">No attendance sessions found</p></CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {pastSessions.map((session: any) => (
                <Card key={session.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => viewSessionDetails(session)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{session.courses?.course_name}</h3>
                          <Badge variant="outline">{session.courses?.course_code}</Badge>
                          {!session.is_active && <Badge variant="secondary" className="text-xs">Closed</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{session.topic || 'No topic'}</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <div className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(session.session_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
                          <div className="flex items-center gap-1"><Clock className="h-4 w-4" />{formatTime(session.start_time)} – {formatTime(session.end_time)}</div>
                          {session.room_location && <div className="flex items-center gap-1"><MapPin className="h-4 w-4" />{session.room_location}</div>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right"><div className="text-2xl font-bold">{session.total_students}</div><div className="text-xs text-muted-foreground">Total</div></div>
                        <div className="flex gap-2 text-xs">
                          <Badge variant="outline"><CheckCircle className="h-3 w-3 mr-1" />{session.present_count}</Badge>
                          <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />{session.late_count}</Badge>
                          <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" />{session.absent_count}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* History Dialog */}
          <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{selectedHistorySession?.courses?.course_name} – Session Details</DialogTitle></DialogHeader>
              <div className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {new Date(selectedHistorySession?.session_date).toLocaleDateString()} • {formatTime(selectedHistorySession?.start_time)} – {formatTime(selectedHistorySession?.end_time)}
                    {selectedHistorySession?.room_location && ` • ${selectedHistorySession.room_location}`}
                  </AlertDescription>
                </Alert>

                {failedAttempts.length > 0 && (
                  <div className="border-2 rounded-lg p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Failed Attempts ({failedAttempts.length})</h3>
                    <div className="space-y-3">
                      {failedAttempts.map((a: any) => (
                        <div key={a.id} className="flex flex-col sm:flex-row items-start justify-between p-3 rounded-lg border-2 gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{a.user_profiles?.first_name} {a.user_profiles?.last_name}</p>
                            <p className="text-xs text-muted-foreground">ID: {a.user_profiles?.user_code}</p>
                            <p className="text-xs mt-1">{a.failure_reason}</p>
                            {a.gps_accuracy && <p className="text-xs text-muted-foreground">GPS: ±{Math.round(a.gps_accuracy)}m</p>}
                            <p className="text-xs text-muted-foreground">{new Date(a.attempted_at).toLocaleTimeString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => approveFailedAttempt(a)}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => rejectFailedAttempt(a.id)} className="border-red-300 text-red-700"><XCircle className="h-3 w-3 mr-1" />Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-5 w-5" />Attendance ({attendanceRecords.filter(r => r.status === 'present' || r.status === 'late').length} / {attendanceRecords.length})</h3>
                  <AttendanceList records={attendanceRecords} isHistory />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="timetable">
          <TimetableManager
          teacherData={teacherData}
          courses={courses}
        />
      </TabsContent>

        <TabsContent value="enrollment">
          <EnrollmentManager teacherData={teacherData} />
        </TabsContent>

        <TabsContent value="courses">
          <CourseManager
            teacherData={teacherData}
            onCoursesChanged={() => {
              fetchTeacherCourses();
              fetchScheduleData();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};


export default TeacherSchedule;
