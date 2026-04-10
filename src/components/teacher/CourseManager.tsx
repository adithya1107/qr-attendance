import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import {
  BookOpen, Plus, Trash2, Clock, MapPin, Calendar,
  AlertCircle, Loader2, Edit2, ChevronDown, ChevronUp,
  Star, ToggleLeft, ToggleRight,
} from 'lucide-react'

interface CourseManagerProps {
  teacherData: {
    user_id: string
    first_name: string
    last_name: string
  }
  onCoursesChanged?: () => void
}

interface Course {
  id: string
  course_name: string
  course_code: string
  is_active: boolean
  schedule_slots: ScheduleSlot[]
  extra_classes: ExtraClass[]
}

interface ScheduleSlot {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  room_location: string | null
}

interface ExtraClass {
  id: string
  title: string
  scheduled_date: string
  start_time: string
  end_time: string
  room_location: string | null
  class_type: string
  status: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CLASS_TYPES = [
  { value: 'extra', label: 'Extra Class' },
  { value: 'remedial', label: 'Remedial' },
  { value: 'makeup', label: 'Makeup' },
  { value: 'special', label: 'Special Session' },
]

const emptyNewCourse = { course_name: '', course_code: '' }
const emptySlot = { day_of_week: '1', start_time: '09:00', end_time: '10:00', room_location: '' }
const emptyExtra = {
  title: '', scheduled_date: '', start_time: '09:00',
  end_time: '10:00', room_location: '', class_type: 'extra',
}

const CourseManager: React.FC<CourseManagerProps> = ({ teacherData, onCoursesChanged }) => {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)

  // New course dialog
  const [newCourseOpen, setNewCourseOpen] = useState(false)
  const [newCourse, setNewCourse] = useState(emptyNewCourse)
  const [savingCourse, setSavingCourse] = useState(false)

  // Edit course dialog
  const [editCourseOpen, setEditCourseOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editForm, setEditForm] = useState(emptyNewCourse)

  // Schedule slot dialog
  const [slotDialogOpen, setSlotDialogOpen] = useState(false)
  const [slotCourseId, setSlotCourseId] = useState<string>('')
  const [newSlot, setNewSlot] = useState(emptySlot)
  const [savingSlot, setSavingSlot] = useState(false)

  // Extra class dialog
  const [extraDialogOpen, setExtraDialogOpen] = useState(false)
  const [extraCourseId, setExtraCourseId] = useState<string>('')
  const [newExtra, setNewExtra] = useState(emptyExtra)
  const [savingExtra, setSavingExtra] = useState(false)

  // Delete/archive confirm
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchCourses()
  }, [teacherData.user_id])

  const fetchCourses = async () => {
    setLoading(true)
    try {
      const { data: coursesData, error } = await supabase
        .from('courses')
        .select('id, course_name, course_code, is_active')
        .eq('instructor_id', teacherData.user_id)
        .order('course_code')

      if (error) throw error

      const coursesWithSchedule: Course[] = await Promise.all(
        (coursesData || []).map(async (c) => {
          const [{ data: slots }, { data: extras }] = await Promise.all([
            supabase
              .from('class_schedule')
              .select('id, day_of_week, start_time, end_time, room_location')
              .eq('course_id', c.id)
              .order('day_of_week'),
            supabase
              .from('extra_class_schedule')
              .select('id, title, scheduled_date, start_time, end_time, room_location, class_type, status')
              .eq('course_id', c.id)
              .eq('teacher_id', teacherData.user_id)
              .order('scheduled_date', { ascending: false })
              .limit(10),
          ])
          return {
            ...c,
            schedule_slots: slots || [],
            extra_classes: extras || [],
          }
        })
      )
      setCourses(coursesWithSchedule)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  // ── CREATE COURSE ──────────────────────────────────────────
  const createCourse = async () => {
    if (!newCourse.course_name.trim() || !newCourse.course_code.trim()) {
      toast.error('Please fill in both course name and course code')
      return
    }
    setSavingCourse(true)
    try {
      const { error } = await supabase.from('courses').insert({
        course_name: newCourse.course_name.trim(),
        course_code: newCourse.course_code.trim().toUpperCase(),
        instructor_id: teacherData.user_id,
        is_active: true,
      })
      if (error) {
        if (error.code === '23505') {
          toast.error('A course with that code already exists')
        } else throw error
        return
      }
      toast.success(`Course "${newCourse.course_code.toUpperCase()}" created!`)
      setNewCourseOpen(false)
      setNewCourse(emptyNewCourse)
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to create course')
    } finally {
      setSavingCourse(false)
    }
  }

  // ── EDIT COURSE ────────────────────────────────────────────
  const openEditCourse = (course: Course) => {
    setEditingCourse(course)
    setEditForm({ course_name: course.course_name, course_code: course.course_code })
    setEditCourseOpen(true)
  }

  const saveCourseEdit = async () => {
    if (!editingCourse) return
    if (!editForm.course_name.trim() || !editForm.course_code.trim()) {
      toast.error('Please fill in both fields')
      return
    }
    setSavingCourse(true)
    try {
      const { error } = await supabase
        .from('courses')
        .update({
          course_name: editForm.course_name.trim(),
          course_code: editForm.course_code.trim().toUpperCase(),
        })
        .eq('id', editingCourse.id)
      if (error) throw error
      toast.success('Course updated')
      setEditCourseOpen(false)
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update course')
    } finally {
      setSavingCourse(false)
    }
  }

  // ── TOGGLE ACTIVE ──────────────────────────────────────────
  const toggleCourseActive = async (course: Course) => {
    setActionLoading(course.id + '-toggle')
    try {
      const { error } = await supabase
        .from('courses')
        .update({ is_active: !course.is_active })
        .eq('id', course.id)
      if (error) throw error
      toast.success(course.is_active ? 'Course deactivated' : 'Course activated')
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update course')
    } finally {
      setActionLoading(null)
    }
  }

  // ── DELETE COURSE ──────────────────────────────────────────
  const confirmDelete = (course: Course) => {
    setDeletingCourse(course)
    setDeleteOpen(true)
  }

  const deleteCourse = async () => {
    if (!deletingCourse) return
    setActionLoading(deletingCourse.id + '-delete')
    try {
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', deletingCourse.id)
      if (error) throw error
      toast.success('Course deleted')
      setDeleteOpen(false)
      setDeletingCourse(null)
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err: any) {
      // FK constraint — has attendance data, deactivate instead
      if (err.code === '23503') {
        toast.error('Cannot delete — this course has attendance records. Deactivate it instead.')
      } else {
        toast.error('Failed to delete course')
      }
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  // ── ADD SCHEDULE SLOT ──────────────────────────────────────
  const openAddSlot = (courseId: string) => {
    setSlotCourseId(courseId)
    setNewSlot(emptySlot)
    setSlotDialogOpen(true)
  }

  const saveSlot = async () => {
    if (!newSlot.start_time || !newSlot.end_time) {
      toast.error('Please set start and end times')
      return
    }
    if (newSlot.start_time >= newSlot.end_time) {
      toast.error('End time must be after start time')
      return
    }
    setSavingSlot(true)
    try {
      const { error } = await supabase.from('class_schedule').insert({
        course_id: slotCourseId,
        day_of_week: parseInt(newSlot.day_of_week),
        start_time: newSlot.start_time,
        end_time: newSlot.end_time,
        room_location: newSlot.room_location.trim() || null,
      })
      if (error) throw error
      toast.success('Schedule slot added')
      setSlotDialogOpen(false)
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to add schedule slot')
    } finally {
      setSavingSlot(false)
    }
  }

  const deleteSlot = async (slotId: string, _courseId: string) => {
    setActionLoading(slotId)
    try {
      const { error } = await supabase.from('class_schedule').delete().eq('id', slotId)
      if (error) throw error
      toast.success('Schedule slot removed')
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove slot')
    } finally {
      setActionLoading(null)
    }
  }

  // ── ADD EXTRA CLASS ────────────────────────────────────────
  const openAddExtra = (courseId: string) => {
    setExtraCourseId(courseId)
    // Default to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setNewExtra({ ...emptyExtra, scheduled_date: tomorrow.toISOString().split('T')[0] })
    setExtraDialogOpen(true)
  }

  const saveExtra = async () => {
    if (!newExtra.title.trim()) { toast.error('Please enter a title'); return }
    if (!newExtra.scheduled_date) { toast.error('Please pick a date'); return }
    if (newExtra.start_time >= newExtra.end_time) { toast.error('End time must be after start time'); return }
    setSavingExtra(true)
    try {
      const { error } = await supabase.from('extra_class_schedule').insert({
        course_id: extraCourseId,
        teacher_id: teacherData.user_id,
        title: newExtra.title.trim(),
        scheduled_date: newExtra.scheduled_date,
        start_time: newExtra.start_time,
        end_time: newExtra.end_time,
        room_location: newExtra.room_location.trim() || null,
        class_type: newExtra.class_type,
        status: 'scheduled',
      })
      if (error) throw error
      toast.success('Extra class scheduled')
      setExtraDialogOpen(false)
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to schedule extra class')
    } finally {
      setSavingExtra(false)
    }
  }

  const deleteExtra = async (extraId: string) => {
    setActionLoading(extraId)
    try {
      const { error } = await supabase.from('extra_class_schedule').delete().eq('id', extraId)
      if (error) throw error
      toast.success('Extra class removed')
      await fetchCourses()
      onCoursesChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove extra class')
    } finally {
      setActionLoading(null)
    }
  }

  const formatTime = (t: string) => {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hr = parseInt(h)
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">My Courses</h2>
          <p className="text-sm text-muted-foreground">Create and manage your courses and schedules</p>
        </div>
        <Button onClick={() => setNewCourseOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Course
        </Button>
      </div>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-lg mb-1">No courses yet</p>
            <p className="text-sm text-muted-foreground mb-6">Create your first course to get started</p>
            <Button onClick={() => setNewCourseOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create a course
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {courses.map(course => (
            <Card key={course.id} className={!course.is_active ? 'opacity-60' : ''}>
              {/* Course header row */}
              <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
                  >
                    <div className="bg-primary/10 rounded-lg p-2 flex-shrink-0">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base font-mono">{course.course_code}</span>
                        {!course.is_active && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{course.course_name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {course.schedule_slots.length} weekly slot{course.schedule_slots.length !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {course.extra_classes.filter(e => e.status === 'scheduled').length} upcoming extra
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => openEditCourse(course)}
                      className="h-8 w-8 p-0"
                      title="Edit course"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => toggleCourseActive(course)}
                      disabled={actionLoading === course.id + '-toggle'}
                      className="h-8 w-8 p-0"
                      title={course.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {actionLoading === course.id + '-toggle'
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : course.is_active
                          ? <ToggleRight className="h-4 w-4 text-green-600" />
                          : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => confirmDelete(course)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete course"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
                      className="h-8 w-8 p-0"
                    >
                      {expandedCourse === course.id
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Expanded section */}
              {expandedCourse === course.id && (
                <CardContent className="pt-0 px-4 sm:px-6 pb-4">
                  <div className="border-t pt-4">
                    <Tabs defaultValue="weekly">
                      <TabsList className="h-8 mb-4">
                        <TabsTrigger value="weekly" className="text-xs px-3 h-6">Weekly Schedule</TabsTrigger>
                        <TabsTrigger value="extra" className="text-xs px-3 h-6">Extra Classes</TabsTrigger>
                      </TabsList>

                      {/* Weekly schedule slots */}
                      <TabsContent value="weekly" className="space-y-3">
                        {course.schedule_slots.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3">No weekly slots yet</p>
                        ) : (
                          <div className="space-y-2">
                            {course.schedule_slots.map(slot => (
                              <div key={slot.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                                <div className="flex items-center gap-3">
                                  <div className="text-center min-w-[40px]">
                                    <p className="text-xs font-bold text-primary">{DAY_SHORT[slot.day_of_week]}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {formatTime(slot.start_time)} — {formatTime(slot.end_time)}
                                    </p>
                                    {slot.room_location && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />{slot.room_location}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => deleteSlot(slot.id, course.id)}
                                  disabled={actionLoading === slot.id}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  {actionLoading === slot.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Trash2 className="h-3 w-3" />}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openAddSlot(course.id)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Add slot
                        </Button>
                      </TabsContent>

                      {/* Extra classes */}
                      <TabsContent value="extra" className="space-y-3">
                        {course.extra_classes.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3">No extra classes scheduled</p>
                        ) : (
                          <div className="space-y-2">
                            {course.extra_classes.map(ec => (
                              <div key={ec.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                                <div className="flex items-center gap-3">
                                  <div className="text-center min-w-[40px]">
                                    <p className="text-xs font-bold text-blue-600">
                                      {new Date(ec.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium">{ec.title}</p>
                                      <Badge variant="outline" className="text-xs capitalize py-0">{ec.class_type}</Badge>
                                      {ec.status !== 'scheduled' && (
                                        <Badge variant="secondary" className="text-xs py-0 capitalize">{ec.status}</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {formatTime(ec.start_time)} — {formatTime(ec.end_time)}
                                      {ec.room_location && ` · ${ec.room_location}`}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => deleteExtra(ec.id)}
                                  disabled={actionLoading === ec.id}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  {actionLoading === ec.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Trash2 className="h-3 w-3" />}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openAddExtra(course.id)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Schedule extra class
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── CREATE COURSE DIALOG ─────────────────────────────── */}
      <Dialog open={newCourseOpen} onOpenChange={open => { setNewCourseOpen(open); if (!open) setNewCourse(emptyNewCourse) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create new course
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="course_code">Course code <span className="text-destructive">*</span></Label>
              <Input
                id="course_code"
                placeholder="e.g. CS101, MATH201"
                value={newCourse.course_code}
                onChange={e => setNewCourse(p => ({ ...p, course_code: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Short unique identifier — must be unique across all courses</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course_name">Course name <span className="text-destructive">*</span></Label>
              <Input
                id="course_name"
                placeholder="e.g. Introduction to Computer Science"
                value={newCourse.course_name}
                onChange={e => setNewCourse(p => ({ ...p, course_name: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setNewCourseOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createCourse} disabled={savingCourse}>
                {savingCourse ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Create course
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT COURSE DIALOG ───────────────────────────────── */}
      <Dialog open={editCourseOpen} onOpenChange={setEditCourseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit course
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Course code</Label>
              <Input
                value={editForm.course_code}
                onChange={e => setEditForm(p => ({ ...p, course_code: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Course name</Label>
              <Input
                value={editForm.course_name}
                onChange={e => setEditForm(p => ({ ...p, course_name: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditCourseOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={saveCourseEdit} disabled={savingCourse}>
                {savingCourse ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ADD SCHEDULE SLOT DIALOG ─────────────────────────── */}
      <Dialog open={slotDialogOpen} onOpenChange={open => { setSlotDialogOpen(open); if (!open) setNewSlot(emptySlot) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Add weekly schedule slot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select value={newSlot.day_of_week} onValueChange={v => setNewSlot(p => ({ ...p, day_of_week: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((day, i) => (
                    <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input type="time" value={newSlot.start_time} onChange={e => setNewSlot(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input type="time" value={newSlot.end_time} onChange={e => setNewSlot(p => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Room / location <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Room A101, Lab 3"
                value={newSlot.room_location}
                onChange={e => setNewSlot(p => ({ ...p, room_location: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setSlotDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={saveSlot} disabled={savingSlot}>
                {savingSlot ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add slot
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ADD EXTRA CLASS DIALOG ───────────────────────────── */}
      <Dialog open={extraDialogOpen} onOpenChange={open => { setExtraDialogOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Schedule extra class
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Makeup class — Chapter 5"
                value={newExtra.title}
                onChange={e => setNewExtra(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Class type</Label>
                <Select value={newExtra.class_type} onValueChange={v => setNewExtra(p => ({ ...p, class_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASS_TYPES.map(ct => (
                      <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newExtra.scheduled_date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setNewExtra(p => ({ ...p, scheduled_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input type="time" value={newExtra.start_time} onChange={e => setNewExtra(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input type="time" value={newExtra.end_time} onChange={e => setNewExtra(p => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Room / location <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Room B202"
                value={newExtra.room_location}
                onChange={e => setNewExtra(p => ({ ...p, room_location: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setExtraDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={saveExtra} disabled={savingExtra}>
                {savingExtra ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM DIALOG ────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete course
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">{deletingCourse?.course_code} — {deletingCourse?.course_name}</span>?
            </p>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This will also delete all schedule slots. Courses with existing attendance records cannot be deleted — deactivate them instead.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive" className="flex-1"
                onClick={deleteCourse}
                disabled={actionLoading === deletingCourse?.id + '-delete'}
              >
                {actionLoading === deletingCourse?.id + '-delete'
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Trash2 className="h-4 w-4 mr-2" />}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CourseManager
