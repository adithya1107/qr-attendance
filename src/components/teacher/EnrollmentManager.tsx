import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import {
  Users, Search, UserPlus, UserMinus, BookOpen,
  CheckCircle, AlertCircle, Loader2, GraduationCap, X,
} from 'lucide-react'

interface EnrollmentManagerProps {
  teacherData: {
    user_id: string
    first_name: string
    last_name: string
  }
}

interface Student {
  user_id: string
  first_name: string
  last_name: string
  user_code: string
  email: string
}

interface EnrolledStudent extends Student {
  enrollment_id: string
  enrolled_at: string
}

interface Course {
  id: string
  course_name: string
  course_code: string
}

const EnrollmentManager: React.FC<EnrollmentManagerProps> = ({ teacherData }) => {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Student[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingEnrolled, setLoadingEnrolled] = useState(false)
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState<EnrolledStudent | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchCourses()
  }, [teacherData.user_id])

  useEffect(() => {
    if (selectedCourse) fetchEnrolledStudents(selectedCourse)
  }, [selectedCourse])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => searchStudents(searchQuery), 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, course_name, course_code')
        .eq('instructor_id', teacherData.user_id)
        .eq('is_active', true)
        .order('course_code')

      if (error) throw error
      setCourses(data || [])
      if (data && data.length > 0) setSelectedCourse(data[0].id)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load courses')
    }
  }

  const fetchEnrolledStudents = async (courseId: string) => {
    setLoadingEnrolled(true)
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          created_at,
          user_profiles!enrollments_student_id_fkey (
            user_id,
            first_name,
            last_name,
            user_code,
            email
          )
        `)
        .eq('course_id', courseId)
        .eq('status', 'enrolled')
        .order('created_at', { ascending: false })

      if (error) throw error

      const students: EnrolledStudent[] = (data || []).map((row: any) => ({
        enrollment_id: row.id,
        enrolled_at: row.created_at,
        user_id: row.user_profiles.user_id,
        first_name: row.user_profiles.first_name,
        last_name: row.user_profiles.last_name,
        user_code: row.user_profiles.user_code,
        email: row.user_profiles.email,
      }))

      setEnrolledStudents(students)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load enrolled students')
    } finally {
      setLoadingEnrolled(false)
    }
  }

  const searchStudents = async (query: string) => {
    setSearching(true)
    try {
      // Search by name or user_code, only students
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, first_name, last_name, user_code, email')
        .eq('role', 'student')
        .or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,user_code.ilike.%${query}%,email.ilike.%${query}%`
        )
        .limit(20)

      if (error) throw error

      // Filter out already-enrolled students
      const enrolledIds = new Set(enrolledStudents.map(s => s.user_id))
      setSearchResults((data || []).filter((s: Student) => !enrolledIds.has(s.user_id)))
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  const enrollStudent = async (student: Student) => {
    if (!selectedCourse) return
    setActionLoading(student.user_id)
    try {
      const { error } = await supabase.from('enrollments').insert({
        student_id: student.user_id,
        course_id: selectedCourse,
        status: 'enrolled',
      })

      if (error) {
        if (error.code === '23505') {
          toast.error('Student is already enrolled in this course')
        } else {
          throw error
        }
        return
      }

      toast.success(`${student.first_name} ${student.last_name} enrolled successfully`)
      // Remove from search results, refresh enrolled list
      setSearchResults(prev => prev.filter(s => s.user_id !== student.user_id))
      await fetchEnrolledStudents(selectedCourse)
    } catch (err) {
      console.error(err)
      toast.error('Failed to enroll student')
    } finally {
      setActionLoading(null)
    }
  }

  const confirmRemove = (student: EnrolledStudent) => {
    setStudentToRemove(student)
    setRemoveDialogOpen(true)
  }

  const removeStudent = async () => {
    if (!studentToRemove) return
    setActionLoading(studentToRemove.user_id)
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'dropped' })
        .eq('id', studentToRemove.enrollment_id)

      if (error) throw error

      toast.success(`${studentToRemove.first_name} ${studentToRemove.last_name} removed from course`)
      setRemoveDialogOpen(false)
      setStudentToRemove(null)
      await fetchEnrolledStudents(selectedCourse)
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove student')
    } finally {
      setActionLoading(null)
    }
  }

  const selectedCourseData = courses.find(c => c.id === selectedCourse)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Enrollment Manager</h2>
          <p className="text-sm text-muted-foreground">Manage student enrollments for your courses</p>
        </div>
        <Button onClick={() => setEnrollDialogOpen(true)} disabled={!selectedCourse}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Students
        </Button>
      </div>

      {courses.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have any courses yet. Courses need to be created before you can manage enrollments.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Course selector */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <label className="text-sm font-medium whitespace-nowrap">Select course:</label>
            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Choose a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map(course => (
                  <SelectItem key={course.id} value={course.id}>
                    <span className="font-mono font-medium">{course.course_code}</span>
                    <span className="text-muted-foreground ml-2">— {course.course_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stats bar */}
          {selectedCourseData && (
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border">
              <div className="bg-primary/10 rounded-full p-2">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{selectedCourseData.course_name}</p>
                <p className="text-sm text-muted-foreground">{selectedCourseData.course_code}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{enrolledStudents.length}</p>
                <p className="text-xs text-muted-foreground">enrolled</p>
              </div>
            </div>
          )}

          {/* Enrolled students list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="h-5 w-5" />
                Enrolled Students
                {!loadingEnrolled && (
                  <Badge variant="secondary" className="ml-1">{enrolledStudents.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEnrolled ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : enrolledStudents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No students enrolled yet</p>
                  <p className="text-sm mt-1">Click "Add Students" to enroll students in this course</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {enrolledStudents.map(student => (
                    <div
                      key={student.enrollment_id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-primary/10 rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary">
                            {student.first_name[0]}{student.last_name[0]}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {student.first_name} {student.last_name}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground font-mono">{student.user_code}</span>
                            <span className="text-xs text-muted-foreground hidden sm:inline truncate">{student.email}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {new Date(student.enrolled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmRemove(student)}
                          disabled={actionLoading === student.user_id}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          {actionLoading === student.user_id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <UserMinus className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add students dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={(open) => {
        setEnrollDialogOpen(open)
        if (!open) { setSearchQuery(''); setSearchResults([]) }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add Students — {selectedCourseData?.course_code}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, student ID, or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Search state messages */}
            {searchQuery.length > 0 && searchQuery.length < 2 && (
              <p className="text-xs text-muted-foreground text-center py-2">Type at least 2 characters to search</p>
            )}

            {searching && (
              <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Searching...</span>
              </div>
            )}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No students found</p>
                <p className="text-xs mt-1">Try a different name or ID, or check they've registered an account</p>
              </div>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{searchResults.length} student{searchResults.length !== 1 ? 's' : ''} found</p>
                {searchResults.map(student => (
                  <div
                    key={student.user_id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="bg-green-100 rounded-full w-9 h-9 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-green-700">
                          {student.first_name[0]}{student.last_name[0]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{student.first_name} {student.last_name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">{student.user_code}</span>
                          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{student.email}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => enrollStudent(student)}
                      disabled={actionLoading === student.user_id}
                      className="flex-shrink-0 ml-2"
                    >
                      {actionLoading === student.user_id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><UserPlus className="h-4 w-4 mr-1" />Enroll</>}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Already enrolled summary */}
            {enrolledStudents.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Already enrolled ({enrolledStudents.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {enrolledStudents.map(s => (
                    <Badge key={s.enrollment_id} variant="secondary" className="text-xs font-normal">
                      <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                      {s.first_name} {s.last_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-destructive" />
              Remove student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">
                {studentToRemove?.first_name} {studentToRemove?.last_name}
              </span>{' '}
              from <span className="font-semibold text-foreground">{selectedCourseData?.course_name}</span>?
            </p>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Their past attendance records will be preserved. They can be re-enrolled later.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={removeStudent}
                disabled={actionLoading === studentToRemove?.user_id}
              >
                {actionLoading === studentToRemove?.user_id
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <UserMinus className="h-4 w-4 mr-2" />}
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EnrollmentManager
