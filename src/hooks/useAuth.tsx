import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

interface UserProfile {
  id: string
  user_id: string
  first_name: string
  last_name: string
  email: string
  role: 'student' | 'teacher' | 'admin'
  user_code: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, userData: Partial<UserProfile>) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Retry a fetch up to `attempts` times with a delay between each
const retryFetch = async <T,>(
  fn: () => Promise<T>,
  attempts = 5,
  delayMs = 500
): Promise<T> => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      // PGRST116 = 0 rows returned — profile not written yet, retry
      const isNotFound = err?.code === 'PGRST116' || err?.message?.includes('0 rows')
      if (isNotFound && i < attempts - 1) {
        await new Promise(res => setTimeout(res, delayMs * (i + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    try {
      // Retry up to 5x — profile insert may lag slightly behind auth when
      // email confirmation is disabled and the session fires immediately
      const data = await retryFetch(() =>
        supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', userId)
          .single()
          .then(({ data, error }) => {
            if (error) throw error
            return data
          })
      )
      setProfile(data)
    } catch (err) {
      // Profile genuinely missing — user may have signed up via Supabase
      // dashboard without going through our signUp flow. Just stay logged out.
      console.warn('Profile not found for user:', userId, err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, userData: Partial<UserProfile>) => {
    // Pass all profile data as metadata so the DB trigger can create the
    // profile row even if the JS upsert below races or is blocked by RLS
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          role: userData.role || 'student',
          user_code: userData.user_code || generateUserCode(),
        },
      },
    })
    if (error) return { error: error as Error }

    if (!data.user) return { error: new Error('No user returned from sign up') }

    // Also upsert directly — whichever wins, the profile will exist
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: data.user.id,
          email,
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          role: userData.role || 'student',
          user_code: userData.user_code || generateUserCode(),
        },
        { onConflict: 'user_id' }
      )

    if (profileError) {
      // Trigger may have already created it — not fatal
      console.warn('Profile upsert warning (may be fine if trigger ran):', profileError)
    }

    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

const generateUserCode = () => {
  return 'USR' + Math.random().toString(36).substring(2, 8).toUpperCase()
}
