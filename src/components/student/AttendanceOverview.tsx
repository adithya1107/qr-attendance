import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle, XCircle, AlertTriangle, Clock, Hash,
  Scan, QrCode as QrCodeIcon, AlertCircle, Edit,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import QrScanner from 'qr-scanner';
import { calculateDistance } from '@/lib/locationUtils';

interface AttendanceOverviewProps {
  studentData: {
    user_id: string;
    first_name: string;
    last_name: string;
    user_code: string;
  };
}

const AttendanceOverview: React.FC<AttendanceOverviewProps> = ({ studentData }) => {
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [overallStats, setOverallStats] = useState({
    totalClasses: 0,
    attendedClasses: 0,
    lateClasses: 0,
    percentage: 0,
    effectiveAttendance: 0,
    status: 'good',
  });
  const [courseStats, setCourseStats] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [sessionCode, setSessionCode] = useState('');
  const [markingLoading, setMarkingLoading] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [qrScanner, setQrScanner] = useState<QrScanner | null>(null);

  useEffect(() => {
    if (studentData?.user_id) {
      fetchAttendanceData();
      fetchCourses();
      fetchTodayAttendance();
      fetchActiveSessions();
      const interval = setInterval(fetchActiveSessions, 30000);
      return () => clearInterval(interval);
    }
  }, [studentData, selectedCourse]);

  useEffect(() => {
    if (scanDialogOpen && videoRef && !qrScanner) {
      const scanner = new QrScanner(videoRef, (result) => handleQRScan(result.data), {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
      });
      setQrScanner(scanner);
      scanner.start();
    }
    return () => {
      if (qrScanner) {
        qrScanner.stop();
        qrScanner.destroy();
        setQrScanner(null);
      }
    };
  }, [scanDialogOpen, videoRef]);

  const fetchTodayAttendance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance')
        .select(`*, courses(course_name,course_code), attendance_sessions(session_date,start_time,end_time,topic)`)
        .eq('student_id', studentData.user_id)
        .eq('class_date', today);
      if (error) throw error;
      setTodayAttendance(data || []);
    } catch (err) {
      console.error('Error fetching today attendance:', err);
    }
  };

  const fetchActiveSessions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentTime = new Date().toTimeString().slice(0, 5);
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', studentData.user_id)
        .eq('status', 'enrolled');
      if (!enrollments || enrollments.length === 0) return;
      const courseIds = enrollments.map((e: any) => e.course_id);
      const { data: sessions, error } = await supabase
        .from('attendance_sessions')
        .select(`*, courses(course_name,course_code), user_profiles!attendance_sessions_instructor_id_fkey(first_name,last_name)`)
        .in('course_id', courseIds)
        .eq('session_date', today)
        .eq('is_active', true)
        .lte('start_time', currentTime)
        .gte('end_time', currentTime);
      if (error) throw error;
      const sessionsWithStatus = await Promise.all(
        (sessions || []).map(async (session: any) => {
          const { data: attendance } = await supabase
            .from('attendance')
            .select('status')
            .eq('session_id', session.id)
            .eq('student_id', studentData.user_id)
            .single();
          const startTimeParts = session.start_time.split(':');
          const startDate = new Date();
          startDate.setHours(parseInt(startTimeParts[0]), parseInt(startTimeParts[1]), 0, 0);
          const elapsedMinutes = Math.floor((new Date().getTime() - startDate.getTime()) / 60000);
          return {
            ...session,
            alreadyMarked: !!attendance,
            markedStatus: attendance?.status,
            minutesSinceStart: elapsedMinutes,
            isLateWindow: elapsedMinutes > 10,
          };
        })
      );
      setActiveSessions(sessionsWithStatus);
    } catch (err) {
      console.error('Error fetching active sessions:', err);
    }
  };

  const markAttendance = async (code: string) => {
    try {
      setMarkingLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const { data: session, error: sessionError } = await supabase
        .from('attendance_sessions')
        .select(`*, courses(course_name,course_code), user_profiles!attendance_sessions_instructor_id_fkey(first_name,last_name,id)`)
        .eq('qr_code', code.toUpperCase())
        .eq('session_date', today)
        .eq('is_active', true)
        .single();
      if (sessionError || !session) {
        toast.error('Invalid session code or session has expired');
        return;
      }
      const { data: existingAttendance } = await supabase
        .from('attendance')
        .select('id, status')
        .eq('session_id', session.id)
        .eq('student_id', studentData.user_id)
        .single();
      if (existingAttendance) {
        toast.info(`Already marked as ${existingAttendance.status}`);
        return;
      }
      const { data: existingAttempt } = await supabase
        .from('attendance_attempts')
        .select('id, status')
        .eq('session_id', session.id)
        .eq('student_id', studentData.user_id)
        .eq('status', 'pending')
        .single();
      if (existingAttempt) {
        toast.info('You already have a pending verification request.');
        return;
      }
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('course_id', session.course_id)
        .eq('student_id', studentData.user_id)
        .eq('status', 'enrolled')
        .single();
      if (!enrollment) {
        toast.error('You are not enrolled in this course');
        return;
      }

      let studentLocation: { latitude: number; longitude: number } | null = null;
      let distanceFromTeacher: number | null = null;
      let locationAccuracy: number | null = null;
      const hasTeacherLocation = session.teacher_latitude && session.teacher_longitude;

      if (hasTeacherLocation) {
        const locationToast = toast.loading('📍 Getting location...');
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            const ACCEPTABLE_ACCURACY = 30;
            const MAX_WAIT_TIME = 15000;
            const startTime = Date.now();
            let bestPosition: GeolocationPosition | null = null;
            let watchId: number;
            const checkPosition = (pos: GeolocationPosition) => {
              if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) bestPosition = pos;
              if (pos.coords.accuracy <= ACCEPTABLE_ACCURACY || Date.now() - startTime >= MAX_WAIT_TIME) {
                navigator.geolocation.clearWatch(watchId);
                resolve(bestPosition || pos);
              }
            };
            watchId = navigator.geolocation.watchPosition(checkPosition, (err) => {
              navigator.geolocation.clearWatch(watchId);
              reject(err);
            }, { enableHighAccuracy: true, timeout: MAX_WAIT_TIME, maximumAge: 0 });
          });
          toast.dismiss(locationToast);
          studentLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          locationAccuracy = position.coords.accuracy;
          const teacherLocation = { latitude: session.teacher_latitude, longitude: session.teacher_longitude };
          distanceFromTeacher = calculateDistance(teacherLocation, studentLocation);
          const combinedAccuracy = Math.sqrt(400 + (locationAccuracy || 50) ** 2);
          const ADAPTIVE_RADIUS = Math.min(15 + combinedAccuracy + 10, 100);
          if (distanceFromTeacher > ADAPTIVE_RADIUS) {
            await supabase.from('attendance_attempts').insert({
              session_id: session.id, student_id: studentData.user_id, course_id: session.course_id,
              failure_reason: `Distance: ${Math.round(distanceFromTeacher)}m (Required: ${Math.round(ADAPTIVE_RADIUS)}m)`,
              student_latitude: studentLocation.latitude, student_longitude: studentLocation.longitude,
              distance_from_teacher: distanceFromTeacher, gps_accuracy: locationAccuracy, status: 'pending',
            });
            toast.error(`Location verification failed. Distance: ${Math.round(distanceFromTeacher)}m. Your attempt has been logged for teacher review.`, { duration: 8000 });
            return;
          }
        } catch (locationError: any) {
          toast.dismiss(locationToast);
          const reason = locationError.code === 1 ? 'Location permission denied'
            : locationError.code === 2 ? 'Location unavailable'
            : locationError.code === 3 ? 'Location request timeout'
            : 'Location access denied or unavailable';
          await supabase.from('attendance_attempts').insert({
            session_id: session.id, student_id: studentData.user_id, course_id: session.course_id,
            failure_reason: reason, status: 'pending',
          });
          toast.error(`Unable to verify location. ${reason}. Your attempt has been logged.`, { duration: 8000 });
          return;
        }
      }

      const now = new Date();
      if (now.toTimeString().slice(0, 5) > session.end_time) {
        toast.error('Class has ended. Cannot mark attendance.');
        return;
      }
      const [startHour, startMin] = session.start_time.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(startHour, startMin, 0, 0);
      const elapsedMinutes = Math.floor((now.getTime() - startDate.getTime()) / 60000);
      const status = elapsedMinutes > 10 ? 'late' : 'present';

      const attendanceRecord: any = {
        course_id: session.course_id, student_id: studentData.user_id, class_date: session.session_date,
        status, session_id: session.id, marked_by: studentData.user_id, marked_at: now.toISOString(),
        device_info: { timestamp: now.toISOString(), minutes_since_start: elapsedMinutes, has_location: !!studentLocation, location_verified: hasTeacherLocation && !!studentLocation, gps_accuracy: locationAccuracy ? Math.round(locationAccuracy) : null, ...(distanceFromTeacher !== null ? { distance_meters: Math.round(distanceFromTeacher) } : {}) },
      };
      if (studentLocation) { attendanceRecord.student_latitude = studentLocation.latitude; attendanceRecord.student_longitude = studentLocation.longitude; }
      if (distanceFromTeacher !== null) attendanceRecord.distance_from_teacher = distanceFromTeacher;

      const { error: attendanceError } = await supabase.from('attendance').insert(attendanceRecord);
      if (attendanceError) throw attendanceError;

      toast.success(status === 'present' ? '✅ Attendance marked as PRESENT!' : '⚠️ Marked as LATE (0.5x credit)', { duration: 3000 });
      setSessionCode('');
      setScanDialogOpen(false);
      fetchAttendanceData();
      fetchTodayAttendance();
      fetchActiveSessions();
    } catch (err: any) {
      console.error('Error marking attendance:', err);
      toast.error(err.message || 'Failed to mark attendance');
    } finally {
      setMarkingLoading(false);
    }
  };

  const handleManualEntry = async () => {
    if (!sessionCode || sessionCode.length !== 6) { toast.error('Please enter a valid 6-character session code'); return; }
    await markAttendance(sessionCode);
  };

  const handleQRScan = async (code: string) => { await markAttendance(code); };

  const fetchCourses = async () => {
    try {
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`courses(id,course_name,course_code)`)
        .eq('student_id', studentData.user_id)
        .eq('status', 'enrolled');
      if (error) throw error;
      if (enrollments) setCourses(enrollments.map((e: any) => e.courses).filter(Boolean));
    } catch (err) { console.error('Error fetching courses:', err); }
  };

  const fetchAttendanceData = async () => {
    if (!studentData?.user_id) return;
    setLoading(true);
    try {
      let query = supabase.from('attendance').select(`*, courses(course_name,course_code)`).eq('student_id', studentData.user_id).order('class_date', { ascending: false });
      if (selectedCourse !== 'all') query = query.eq('course_id', selectedCourse);
      const { data: attendance, error } = await query;
      if (error) throw error;
      if (attendance) { setAttendanceData(attendance); calculateStats(attendance); calculateCourseStats(attendance); }
    } catch (err) { console.error('Error fetching attendance:', err); toast.error('Failed to load attendance data'); }
    finally { setLoading(false); }
  };

  const calculateStats = (attendance: any[]) => {
    const totalClasses = attendance.length;
    const presentClasses = attendance.filter(a => a.status === 'present').length;
    const lateClasses = attendance.filter(a => a.status === 'late').length;
    const effectivePresent = presentClasses + lateClasses * 0.5;
    const percentage = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 0;
    const effectivePercentage = totalClasses > 0 ? Math.round((effectivePresent / totalClasses) * 100) : 0;
    let status = 'good';
    if (effectivePercentage < 65) status = 'critical';
    else if (effectivePercentage < 75) status = 'warning';
    setOverallStats({ totalClasses, attendedClasses: presentClasses, lateClasses, percentage, effectiveAttendance: effectivePercentage, status });
  };

  const calculateCourseStats = (attendance: any[]) => {
    const courseMap = new Map();
    attendance.forEach(record => {
      if (!courseMap.has(record.course_id)) courseMap.set(record.course_id, { course_id: record.course_id, course_name: record.courses?.course_name || 'Unknown', course_code: record.courses?.course_code || 'N/A', total: 0, present: 0, absent: 0, late: 0 });
      const d = courseMap.get(record.course_id);
      d.total++;
      if (record.status === 'present') d.present++;
      else if (record.status === 'absent') d.absent++;
      else if (record.status === 'late') d.late++;
    });
    const stats = Array.from(courseMap.values()).map(c => {
      const eff = c.present + c.late * 0.5;
      return { ...c, percentage: c.total > 0 ? Math.round((c.present / c.total) * 100) : 0, effectivePercentage: c.total > 0 ? Math.round((eff / c.total) * 100) : 0 };
    });
    setCourseStats(stats);
  };

  const getStatusColor = (status: string) => {
    if (status === 'present') return 'text-green-700 border-green-200';
    if (status === 'late') return 'text-yellow-700 border-yellow-200';
    if (status === 'absent') return 'text-red-700 border-red-200';
    return 'text-gray-700 border-gray-200';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'present') return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (status === 'late') return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    if (status === 'absent') return <XCircle className="h-5 w-5 text-red-600" />;
    return <Clock className="h-5 w-5 text-gray-600" />;
  };

  const getAttendanceStatusColor = (status: string) => {
    if (status === 'present') return 'text-green-600 bg-green-50';
    if (status === 'absent') return 'text-red-600 bg-red-50';
    if (status === 'late') return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getStatusBadgeVariant = (percentage: number): 'default' | 'secondary' | 'destructive' => {
    if (percentage >= 75) return 'default';
    if (percentage >= 65) return 'secondary';
    return 'destructive';
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold">Attendance Overview</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Track your class attendance and statistics</p>
        </div>
        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Select course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map((course: any) => (
              <SelectItem key={course.id} value={course.id}>{course.course_code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <Card className="col-span-2 sm:col-span-3 lg:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Effective Attendance</p>
            <p className="text-2xl sm:text-3xl font-bold mt-1">{overallStats.effectiveAttendance}%</p>
            <p className="text-xs text-muted-foreground">Late = 0.5x points</p>
            <Progress value={overallStats.effectiveAttendance} className="mt-2 h-2" />
          </CardContent>
        </Card>
        {[
          { label: 'Total Classes', value: overallStats.totalClasses, color: '' },
          { label: 'Present', value: overallStats.attendedClasses, color: 'text-green-600' },
          { label: 'Late (0.5x)', value: overallStats.lateClasses, color: 'text-yellow-600' },
          { label: 'Absent', value: overallStats.totalClasses - overallStats.attendedClasses - overallStats.lateClasses, color: 'text-red-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-3 sm:p-4 text-center">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl sm:text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="mark" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mark">Mark Attendance</TabsTrigger>
          <TabsTrigger value="summary">Course Summary</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Mark Attendance Tab */}
        <TabsContent value="mark" className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Attendance Rules:</strong> Mark within first 10 minutes for full credit (Present). After 10 minutes = Late (0.5x credit).
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCodeIcon className="h-5 w-5" />
                Mark Attendance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Enter 6-Character Session Code</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="ABC123"
                    value={sessionCode}
                    onChange={e => setSessionCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="font-mono text-lg tracking-wider"
                    disabled={markingLoading}
                  />
                  <Button onClick={handleManualEntry} disabled={markingLoading || sessionCode.length !== 6}>
                    <Hash className="h-4 w-4 mr-2" />
                    Submit
                  </Button>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <Button onClick={() => setScanDialogOpen(true)} className="w-full" variant="outline" disabled={markingLoading}>
                <Scan className="h-4 w-4 mr-2" />
                Scan QR Code
              </Button>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-green-600" />
                  Active Classes ({activeSessions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeSessions.map((session: any) => (
                  <div key={session.id} className={`p-4 rounded-lg border-2 ${session.alreadyMarked ? 'border-gray-200' : session.isLateWindow ? 'border-yellow-200' : 'border-green-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg">{session.courses.course_name}</h4>
                        <p className="text-sm text-muted-foreground">{session.courses.course_code}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(session.start_time)} - {formatTime(session.end_time)}</span>
                        </div>
                        {!session.alreadyMarked && (
                          <div className={`text-xs font-medium mt-2 flex items-center gap-1 ${session.isLateWindow ? 'text-yellow-700' : 'text-green-700'}`}>
                            <AlertCircle className="h-3 w-3" />
                            {session.isLateWindow ? 'Late window – will be marked Late (0.5x)' : `${10 - session.minutesSinceStart} min left for full credit`}
                          </div>
                        )}
                      </div>
                      <div>
                        {session.alreadyMarked ? (
                          <Badge variant="outline" className="capitalize flex items-center gap-1">
                            {getStatusIcon(session.markedStatus)}
                            {session.markedStatus}{session.markedStatus === 'late' && ' (0.5x)'}
                          </Badge>
                        ) : (
                          <Badge className={session.isLateWindow ? 'bg-yellow-600' : 'bg-green-600'}>
                            {session.isLateWindow ? 'Mark (Late)' : 'Mark Now'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Today's Attendance */}
          <Card>
            <CardHeader><CardTitle>Today's Attendance</CardTitle></CardHeader>
            <CardContent>
              {todayAttendance.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No attendance marked today</p>
              ) : (
                <div className="space-y-3">
                  {todayAttendance.map((record: any) => (
                    <div key={record.id} className={`p-4 rounded-lg border ${getStatusColor(record.status)}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{record.courses.course_name}</h4>
                          <p className="text-sm opacity-80">{record.courses.course_code}</p>
                          <div className="text-xs opacity-70 mt-1">Marked at {new Date(record.marked_at).toLocaleTimeString()}</div>
                          {record.marked_by && record.marked_by !== record.student_id && (
                            <div className="text-xs mt-1 flex items-center gap-1 text-blue-600">
                              <Edit className="h-3 w-3" />Modified by instructor
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(record.status)}
                          <Badge variant="outline" className="capitalize">
                            {record.status}{record.status === 'late' && ' (0.5x)'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* QR Scanner Dialog */}
          <Dialog open={scanDialogOpen} onOpenChange={(open) => {
            setScanDialogOpen(open);
            if (!open && qrScanner) { qrScanner.stop(); qrScanner.destroy(); setQrScanner(null); }
          }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Scan QR Code</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden">
                  <video ref={setVideoRef} className="w-full h-full object-cover" autoPlay playsInline />
                  <div className="absolute inset-0 border-2 border-white/30 pointer-events-none">
                    {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
                      <div key={corner} className={`absolute w-8 h-8 ${corner.includes('top') ? 'top-0' : 'bottom-0'} ${corner.includes('left') ? 'left-0' : 'right-0'} ${corner.includes('top') ? 'border-t-4' : 'border-b-4'} ${corner.includes('left') ? 'border-l-4' : 'border-r-4'} border-primary`} />
                    ))}
                  </div>
                </div>
                <Alert>
                  <Scan className="h-4 w-4" />
                  <AlertDescription>Position the QR code within the frame to mark your attendance.</AlertDescription>
                </Alert>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Course Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Course-wise Attendance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {courseStats.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No attendance data available</p>
              ) : courseStats.map((course, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{course.course_name}</h4>
                    <p className="text-sm text-muted-foreground">{course.course_code}</p>
                    <div className="flex items-center space-x-4 mt-2 text-xs">
                      <span className="text-green-600">Present: {course.present}</span>
                      <span className="text-yellow-600">Late: {course.late}</span>
                      <span className="text-red-600">Absent: {course.absent}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <Badge variant={getStatusBadgeVariant(course.effectivePercentage)}>{course.effectivePercentage}%</Badge>
                    <div className="w-24"><Progress value={course.effectivePercentage} /></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>Recent Attendance</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 sm:space-y-3">
                {attendanceData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No attendance records found</p>
                ) : attendanceData.slice(0, 20).map((record: any, index: number) => (
                  <div key={index} className="flex items-start sm:items-center justify-between p-3 border rounded-lg gap-2">
                    <div className="flex items-start space-x-2 sm:space-x-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 mt-0.5">
                        {record.status === 'present' ? <CheckCircle className="h-4 w-4 text-green-600" />
                          : record.status === 'absent' ? <XCircle className="h-4 w-4 text-red-600" />
                          : <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{record.courses?.course_name}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {new Date(record.class_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                        {record.status === 'late' && <p className="text-xs text-yellow-600 mt-1">Points: 0.5x (Half credit)</p>}
                        {record.marked_by && record.marked_by !== record.student_id && (
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1"><Edit className="h-3 w-3" />Modified by instructor</p>
                        )}
                      </div>
                    </div>
                    <Badge className={`${getAttendanceStatusColor(record.status)} flex-shrink-0 text-xs`}>
                      {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                      {record.status === 'late' && ' (0.5x)'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AttendanceOverview;
