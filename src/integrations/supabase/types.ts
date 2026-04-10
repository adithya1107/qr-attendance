// src/integrations/supabase/types.ts
// Hand-written to match your schema. Re-generate with:
//   npx supabase gen types typescript --project-id <your-project-id> > src/integrations/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          user_id: string;
          first_name: string;
          last_name: string;
          email: string;
          role: 'student' | 'teacher' | 'admin';
          user_code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          first_name: string;
          last_name: string;
          email: string;
          role: 'student' | 'teacher' | 'admin';
          user_code: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_profiles']['Insert']>;
      };

      courses: {
        Row: {
          id: string;
          course_name: string;
          course_code: string;
          instructor_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_name: string;
          course_code: string;
          instructor_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['courses']['Insert']>;
      };

      class_schedule: {
        Row: {
          id: string;
          course_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          room_location: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          room_location?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['class_schedule']['Insert']>;
      };

      extra_class_schedule: {
        Row: {
          id: string;
          course_id: string;
          teacher_id: string;
          title: string;
          description: string | null;
          scheduled_date: string;
          start_time: string;
          end_time: string;
          room_location: string | null;
          class_type: 'extra' | 'remedial' | 'makeup' | 'special';
          status: 'scheduled' | 'cancelled' | 'completed';
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          teacher_id: string;
          title: string;
          description?: string | null;
          scheduled_date: string;
          start_time: string;
          end_time: string;
          room_location?: string | null;
          class_type?: 'extra' | 'remedial' | 'makeup' | 'special';
          status?: 'scheduled' | 'cancelled' | 'completed';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['extra_class_schedule']['Insert']>;
      };

      enrollments: {
        Row: {
          id: string;
          student_id: string;
          course_id: string;
          status: 'enrolled' | 'dropped' | 'completed';
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          course_id: string;
          status?: 'enrolled' | 'dropped' | 'completed';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['enrollments']['Insert']>;
      };

      attendance_sessions: {
        Row: {
          id: string;
          course_id: string;
          instructor_id: string | null;
          session_date: string;
          start_time: string;
          end_time: string;
          session_type: string;
          topic: string | null;
          qr_code: string;
          is_active: boolean;
          room_location: string | null;
          teacher_latitude: number | null;
          teacher_longitude: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          instructor_id?: string | null;
          session_date: string;
          start_time: string;
          end_time: string;
          session_type?: string;
          topic?: string | null;
          qr_code: string;
          is_active?: boolean;
          room_location?: string | null;
          teacher_latitude?: number | null;
          teacher_longitude?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['attendance_sessions']['Insert']>;
      };

      attendance: {
        Row: {
          id: string;
          course_id: string;
          student_id: string;
          class_date: string;
          status: 'present' | 'late' | 'absent';
          session_id: string | null;
          marked_by: string | null;
          marked_at: string | null;
          device_info: Json | null;
          student_latitude: number | null;
          student_longitude: number | null;
          distance_from_teacher: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          student_id: string;
          class_date: string;
          status: 'present' | 'late' | 'absent';
          session_id?: string | null;
          marked_by?: string | null;
          marked_at?: string | null;
          device_info?: Json | null;
          student_latitude?: number | null;
          student_longitude?: number | null;
          distance_from_teacher?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['attendance']['Insert']>;
      };

      attendance_attempts: {
        Row: {
          id: string;
          session_id: string;
          student_id: string;
          course_id: string;
          failure_reason: string | null;
          student_latitude: number | null;
          student_longitude: number | null;
          distance_from_teacher: number | null;
          gps_accuracy: number | null;
          status: 'pending' | 'approved' | 'rejected';
          reviewed_by: string | null;
          reviewed_at: string | null;
          attempted_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          student_id: string;
          course_id: string;
          failure_reason?: string | null;
          student_latitude?: number | null;
          student_longitude?: number | null;
          distance_from_teacher?: number | null;
          gps_accuracy?: number | null;
          status?: 'pending' | 'approved' | 'rejected';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          attempted_at?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['attendance_attempts']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}