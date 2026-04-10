import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { QrCode, GraduationCap, BookOpen, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react'

const LoginPage: React.FC = () => {
  const { signIn, signUp } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'student' as 'student' | 'teacher',
    userCode: '',
  })

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isLogin) {
        const { error } = await signIn(form.email, form.password)
        if (error) throw error
        toast.success('Signed in successfully!')
      } else {
        if (!form.firstName || !form.lastName || !form.userCode) {
          throw new Error('Please fill in all fields')
        }
        const { error } = await signUp(form.email, form.password, {
          first_name: form.firstName,
          last_name: form.lastName,
          role: form.role,
          user_code: form.userCode,
        })
        if (error) throw error
        toast.success('Account created! Please check your email to verify.')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-blue-900/5 blur-[80px]" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10 gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/30 blur-xl rounded-2xl" />
            <div className="relative bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-3.5 shadow-2xl">
              <QrCode className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "'Sora', 'DM Sans', sans-serif" }}>
              QR Attendance
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">Smart tracking for modern classrooms</p>
          </div>
        </div>

        {/* Role pills */}
        <div className="flex justify-center gap-3 mb-8">
          {[
            { role: 'student', icon: GraduationCap, label: 'Student', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
            { role: 'teacher', icon: BookOpen, label: 'Teacher', color: 'text-violet-400', bg: 'bg-violet-400/10' },
          ].map(({ role, icon: Icon, label, color, bg }) => (
            <div
              key={role}
              onClick={() => !isLogin && handleChange('role', role)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all duration-200 ${
                !isLogin && form.role === role
                  ? `${bg} ${color} border-current/30`
                  : isLogin
                  ? `${bg} ${color} border-current/20`
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 cursor-pointer hover:border-zinc-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-6 shadow-2xl">
          {/* Tab switcher */}
          <div className="flex bg-zinc-800/60 rounded-xl p-1 mb-6">
            {['Sign In', 'Sign Up'].map((tab, i) => (
              <button
                key={tab}
                type="button"
                onClick={() => setIsLogin(i === 0)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isLogin === (i === 0)
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">First Name</Label>
                    <Input
                      placeholder="John"
                      value={form.firstName}
                      onChange={e => handleChange('firstName', e.target.value)}
                      required
                      className="bg-zinc-800/60 border-zinc-700/60 text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:ring-indigo-500/20 h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Last Name</Label>
                    <Input
                      placeholder="Doe"
                      value={form.lastName}
                      onChange={e => handleChange('lastName', e.target.value)}
                      required
                      className="bg-zinc-800/60 border-zinc-700/60 text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:ring-indigo-500/20 h-10 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Role</Label>
                  <Select value={form.role} onValueChange={val => handleChange('role', val)}>
                    <SelectTrigger className="bg-zinc-800/60 border-zinc-700/60 text-white h-10 rounded-xl focus:border-indigo-500/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectItem value="student" className="focus:bg-zinc-700">Student</SelectItem>
                      <SelectItem value="teacher" className="focus:bg-zinc-700">Teacher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {form.role === 'student' ? 'Student ID' : 'Employee ID'}
                  </Label>
                  <Input
                    placeholder={form.role === 'student' ? 'e.g. STU2024001' : 'e.g. TCH001'}
                    value={form.userCode}
                    onChange={e => handleChange('userCode', e.target.value.toUpperCase())}
                    required
                    className="bg-zinc-800/60 border-zinc-700/60 text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:ring-indigo-500/20 h-10 rounded-xl font-mono"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                required
                className="bg-zinc-800/60 border-zinc-700/60 text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:ring-indigo-500/20 h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => handleChange('password', e.target.value)}
                  required
                  minLength={6}
                  className="bg-zinc-800/60 border-zinc-700/60 text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:ring-indigo-500/20 h-10 rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border-0 text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30 hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isLogin ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Secure · Private · Built for education
        </p>
      </div>
    </div>
  )
}

export default LoginPage