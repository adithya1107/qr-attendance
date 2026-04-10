import React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AttendanceOverview from '@/components/student/AttendanceOverview'
import TeacherSchedule from '@/components/teacher/TeacherSchedule'
import { QrCode, LogOut, GraduationCap, BookOpen, User } from 'lucide-react'

const Dashboard: React.FC = () => {
  const { profile, signOut } = useAuth()

  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
      <div className="text-muted-foreground text-sm max-w-sm">
        <p className="font-semibold text-base text-foreground mb-2">Profile not found</p>
        <p>Your account exists but your profile was not saved. This can happen if sign-up was interrupted.</p>
        <p className="mt-2">Please sign out and create a new account.</p>
      </div>
      <Button variant="outline" onClick={signOut}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign out
      </Button>
    </div>
  )

  const isStudent = profile.role === 'student'
  const isTeacher = profile.role === 'teacher'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-primary rounded-lg p-2">
                <QrCode className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-none">QR Attendance</h1>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">
                  {isStudent ? 'Student Portal' : 'Teacher Portal'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <div className={`rounded-full p-1.5 ${isStudent ? 'bg-green-100' : 'bg-purple-100'}`}>
                  {isStudent
                    ? <GraduationCap className="h-4 w-4 text-green-600" />
                    : <BookOpen className="h-4 w-4 text-purple-600" />}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium leading-none">{profile.first_name} {profile.last_name}</p>
                  <p className="text-xs text-muted-foreground leading-none mt-0.5">{profile.user_code}</p>
                </div>
                <Badge variant={isStudent ? 'default' : 'secondary'} className="capitalize">{profile.role}</Badge>
              </div>

              <div className="flex sm:hidden items-center gap-1">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{profile.first_name}</span>
              </div>

              <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isStudent && (
          <AttendanceOverview
            studentData={{
              user_id: profile.user_id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              user_code: profile.user_code,
            }}
          />
        )}
        {isTeacher && (
          <TeacherSchedule
            teacherData={{
              user_id: profile.user_id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              user_code: profile.user_code,
            }}
          />
        )}
        {!isStudent && !isTeacher && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Role not configured</p>
            <p className="text-sm mt-2">Please contact an administrator to assign your role.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default Dashboard
