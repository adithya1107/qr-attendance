import React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import AttendanceOverview from '@/components/student/AttendanceOverview'
import TeacherSchedule from '@/components/teacher/TeacherSchedule'
import { QrCode, LogOut, GraduationCap, BookOpen } from 'lucide-react'

const Dashboard: React.FC = () => {
  const { profile, signOut } = useAuth()

  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-5 p-6 text-center bg-[#0a0a0f]">
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <p className="font-semibold text-base text-white mb-2">Profile not found</p>
        <p className="text-sm text-zinc-500">
          Your account exists but your profile was not saved. This can happen if sign-up was interrupted. Please sign out and create a new account.
        </p>
        <Button
          variant="outline"
          onClick={signOut}
          className="mt-6 w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  )

  const isStudent = profile.role === 'student'
  const isTeacher = profile.role === 'teacher'

  const roleConfig = isStudent
    ? { label: 'Student Portal', icon: GraduationCap, color: 'text-emerald-400', bg: 'bg-emerald-400/10', badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' }
    : { label: 'Teacher Portal', icon: BookOpen, color: 'text-violet-400', bg: 'bg-violet-400/10', badgeBg: 'bg-violet-500/15 text-violet-300 border-violet-500/20' }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-indigo-600/6 blur-[100px] rounded-full" />
        <div className="absolute top-0 right-1/4 w-[400px] h-[200px] bg-violet-600/5 blur-[80px] rounded-full" />
      </div>

      {/* Top Nav */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-xl" />
              </div>
              <div className="hidden xs:block">
                <h1 className="font-bold text-base sm:text-lg leading-none text-white">QR Attendance</h1>
                <p className="text-xs text-zinc-500 leading-none mt-0.5">{roleConfig.label}</p>
              </div>
              <div className="xs:hidden">
                <h1 className="font-bold text-base leading-none text-white">Attendance Portal</h1>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* User info — hidden on very small screens */}
              <div className="hidden sm:flex items-center gap-2.5">
                <div>
                  <p className="text-sm font-medium leading-none text-white">
                    {profile.first_name} {profile.last_name}
                  </p>
                  <p className="text-xs text-zinc-500 leading-none mt-0.5 font-mono">{profile.user_code}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${roleConfig.badgeBg}`}>
                  {profile.role}
                </span>
              </div>

              {/* Name only on mobile */}
              <div className="flex sm:hidden items-center gap-1.5">
                <div className={`rounded-full p-1.5 ${roleConfig.bg}`}>
                  <roleConfig.icon className={`h-3.5 w-3.5 ${roleConfig.color}`} />
                </div>
                <span className="text-sm font-medium text-white">{profile.first_name}</span>
              </div>

              {/* Sign out */}
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm px-2.5 py-2 rounded-lg hover:bg-zinc-800/60 group"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
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
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 max-w-sm">
              <p className="text-lg font-semibold text-white">Role not configured</p>
              <p className="text-sm text-zinc-500 mt-2">Please contact an administrator to assign your role.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default Dashboard