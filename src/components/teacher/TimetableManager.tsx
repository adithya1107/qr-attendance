import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Calendar, Clock, MapPin, Plus, Trash2, Edit2,
  AlertCircle, CheckCircle, BookOpen,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TimetableManagerProps {
  teacherData: {
    user_id: string;
    first_name: string;
    last_name: string;
    user_code: string;
  };
  courses: Array<{ id: string; course_name: string; course_code: string }>;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COLOR_PALETTE = [
  { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  { bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800' },
  { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800' },
  { bg: 'bg-cyan-50 border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-800' },
  { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  { bg: 'bg-pink-50 border-pink-200', text: 'text-pink-700', badge: 'bg-pink-100 text-pink-800' },
];

const defaultForm = { course_id: '', day_of_week: '', start_time: '', end_time: '', room_location: '' };

const TimetableManager: React.FC<TimetableManagerProps> = ({ teacherData, courses }) => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<any>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const courseColorMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    courses.forEach((c, i) => { map[c.id] = i % COLOR_PALETTE.length; });
    return map;
  }, [courses]);

  useEffect(() => { fetchSchedules(); }, [teacherData, courses]);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      if (!courses.length) { setSchedules([]); return; }
      const { data, error } = await supabase
        .from('class_schedule')
        .select('*, courses(id, course_name, course_code)')
        .in('course_id', courses.map(c => c.id))
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      setSchedules(data || []);
    } catch (err) { console.error(err); toast.error('Failed to load timetable'); }
    finally { setLoading(false); }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.course_id) errors.course_id = 'Please select a course';
    if (form.day_of_week === '') errors.day_of_week = 'Please select a day';
    if (!form.start_time) errors.start_time = 'Start time is required';
    if (!form.end_time) errors.end_time = 'End time is required';
    if (form.start_time && form.end_time && form.start_time >= form.end_time)
      errors.end_time = 'End time must be after start time';
    const conflict = schedules.find(s => {
      if (editingSlot && s.id === editingSlot.id) return false;
      if (s.course_id !== form.course_id || String(s.day_of_week) !== String(form.day_of_week)) return false;
      return form.start_time < s.end_time && form.end_time > s.start_time;
    });
    if (conflict) errors.start_time = `Overlaps with ${formatTime(conflict.start_time)} – ${formatTime(conflict.end_time)}`;
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      setSaving(true);
      const payload = {
        course_id: form.course_id,
        day_of_week: parseInt(form.day_of_week),
        start_time: form.start_time,
        end_time: form.end_time,
        room_location: form.room_location || null,
      };
      if (editingSlot) {
        const { error } = await supabase.from('class_schedule').update(payload).eq('id', editingSlot.id);
        if (error) throw error;
        toast.success('Schedule slot updated');
      } else {
        const { error } = await supabase.from('class_schedule').insert(payload);
        if (error) throw error;
        toast.success('Schedule slot added');
      }
      setDialogOpen(false); setEditingSlot(null); setForm({ ...defaultForm }); setFormErrors({});
      fetchSchedules();
    } catch (err: any) { toast.error(err.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('class_schedule').delete().eq('id', id);
      if (error) throw error;
      toast.success('Slot removed'); setDeleteConfirmId(null); fetchSchedules();
    } catch { toast.error('Failed to delete slot'); }
  };

  const openAdd = (prefill?: Partial<typeof defaultForm>) => {
    setEditingSlot(null); setForm({ ...defaultForm, ...prefill }); setFormErrors({}); setDialogOpen(true);
  };
  const openEdit = (slot: any) => {
    setEditingSlot(slot);
    setForm({ course_id: slot.course_id, day_of_week: String(slot.day_of_week), start_time: slot.start_time.slice(0, 5), end_time: slot.end_time.slice(0, 5), room_location: slot.room_location || '' });
    setFormErrors({}); setDialogOpen(true);
  };

  const formatTime = (t: string) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };
  const getDuration = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}` : `${mins}m`;
  };
  const getColor = (courseId: string) => COLOR_PALETTE[courseColorMap[courseId] ?? 0];

  const slotsByDay = React.useMemo(() => {
    const map: Record<number, any[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    schedules.forEach(s => { map[s.day_of_week]?.push(s); });
    return map;
  }, [schedules]);

  const slotsByCourse = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    schedules.forEach(s => { if (!map[s.course_id]) map[s.course_id] = []; map[s.course_id].push(s); });
    return map;
  }, [schedules]);

  const totalHours = schedules.reduce((acc, s) => {
    const [sh, sm] = s.start_time.split(':').map(Number); const [eh, em] = s.end_time.split(':').map(Number);
    return acc + ((eh * 60 + em) - (sh * 60 + sm));
  }, 0);

  if (loading) return <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-24 bg-muted rounded-lg animate-pulse"/>)}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Timetable Manager</h2>
          <p className="text-sm text-muted-foreground">{schedules.length} slot{schedules.length !== 1 ? 's' : ''} · {Math.floor(totalHours/60)}h{totalHours%60>0?` ${totalHours%60}m`:''} / week</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <Button variant={viewMode==='grid'?'default':'ghost'} size="sm" className="rounded-none" onClick={()=>setViewMode('grid')}>Grid</Button>
            <Button variant={viewMode==='list'?'default':'ghost'} size="sm" className="rounded-none" onClick={()=>setViewMode('list')}>By Course</Button>
          </div>
          <Button onClick={()=>openAdd()} disabled={courses.length===0}><Plus className="h-4 w-4 mr-2"/>Add Slot</Button>
        </div>
      </div>

      {courses.length===0 && <Alert><AlertCircle className="h-4 w-4"/><AlertDescription>No active courses. Create a course first.</AlertDescription></Alert>}

      {/* Legend */}
      {courses.length>0 && (
        <div className="flex flex-wrap gap-2">
          {courses.map(c=>{const color=getColor(c.id);const count=(slotsByCourse[c.id]||[]).length;return(
            <span key={c.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color.bg} ${color.text}`}>
              <BookOpen className="h-3 w-3"/>{c.course_code}
              {count>0&&<span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${color.badge}`}>{count}</span>}
            </span>
          );})}
        </div>
      )}

      {schedules.length===0&&courses.length>0&&(
        <Card><CardContent className="py-16 text-center">
          <Calendar className="h-14 w-14 mx-auto mb-4 text-muted-foreground/40"/>
          <p className="font-semibold text-lg text-muted-foreground">No schedule slots yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Add recurring weekly class slots for your courses</p>
          <Button onClick={()=>openAdd()}><Plus className="h-4 w-4 mr-2"/>Add First Slot</Button>
        </CardContent></Card>
      )}

      {/* Grid View */}
      {viewMode==='grid'&&schedules.length>0&&(
        <Card><CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-8 border-b">
              <div className="p-3"/>
              {DAYS_SHORT.map((d,i)=>(
                <div key={d} className={`p-3 text-center text-xs font-semibold border-l ${i===new Date().getDay()?'bg-primary text-primary-foreground':'text-muted-foreground'}`}>
                  {d}{slotsByDay[i].length>0&&<div className="mt-0.5 text-[10px] opacity-70">{slotsByDay[i].length} class{slotsByDay[i].length>1?'es':''}</div>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-8">
              <div className="border-r"><div className="p-3 text-xs text-muted-foreground text-center">Classes</div></div>
              {DAYS.map((_,dayIdx)=>(
                <div key={dayIdx} className={`border-l min-h-[140px] p-2 space-y-1.5 ${dayIdx===new Date().getDay()?'bg-primary/5':''}`}>
                  {slotsByDay[dayIdx].length===0?(
                    <button onClick={()=>openAdd({day_of_week:String(dayIdx)})}
                      className="w-full h-full min-h-[100px] flex items-center justify-center rounded-lg border-2 border-dashed border-muted hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                      <Plus className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60"/>
                    </button>
                  ):slotsByDay[dayIdx].sort((a,b)=>a.start_time.localeCompare(b.start_time)).map(slot=>{
                    const color=getColor(slot.course_id);
                    return(
                      <div key={slot.id} className={`relative rounded-lg border p-2 text-xs group cursor-default ${color.bg} ${color.text}`}>
                        <div className="font-bold truncate">{slot.courses?.course_code}</div>
                        <div className="text-[10px] mt-0.5 opacity-80">{formatTime(slot.start_time)}</div>
                        <div className="text-[10px] opacity-70">{getDuration(slot.start_time,slot.end_time)}</div>
                        {slot.room_location&&<div className="text-[10px] opacity-70 flex items-center gap-0.5 mt-0.5"><MapPin className="h-2 w-2"/><span className="truncate">{slot.room_location}</span></div>}
                        <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                          <button onClick={()=>openEdit(slot)} className="p-0.5 rounded hover:bg-white/60"><Edit2 className="h-3 w-3"/></button>
                          <button onClick={()=>setDeleteConfirmId(slot.id)} className="p-0.5 rounded hover:bg-red-100 text-red-600"><Trash2 className="h-3 w-3"/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent></Card>
      )}

      {/* List View */}
      {viewMode==='list'&&schedules.length>0&&(
        <div className="space-y-4">
          {courses.filter(c=>slotsByCourse[c.id]?.length>0).map(course=>{
            const color=getColor(course.id);
            const slots=[...(slotsByCourse[course.id]||[])].sort((a,b)=>a.day_of_week-b.day_of_week||a.start_time.localeCompare(b.start_time));
            return(
              <Card key={course.id}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${color.badge}`}>{course.course_code}</span>
                      <span className="font-semibold text-sm">{course.course_name}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={()=>openAdd({course_id:course.id})}><Plus className="h-3 w-3 mr-1"/>Add</Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {slots.map((slot:any)=>(
                    <div key={slot.id} className={`flex items-center justify-between p-3 rounded-lg border ${color.bg}`}>
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`text-sm font-semibold min-w-[36px] ${color.text}`}>{DAYS_SHORT[slot.day_of_week]}</div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5"/>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                          <span className="text-xs opacity-60 ml-1">({getDuration(slot.start_time,slot.end_time)})</span>
                        </div>
                        {slot.room_location&&<div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5"/>{slot.room_location}</div>}
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={()=>openEdit(slot)}><Edit2 className="h-3.5 w-3.5"/></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={()=>setDeleteConfirmId(slot.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
          {courses.filter(c=>!slotsByCourse[c.id]?.length).length>0&&(
            <Card className="border-dashed"><CardContent className="py-4 px-4">
              <p className="text-sm text-muted-foreground font-medium mb-2">Courses without schedule:</p>
              <div className="flex flex-wrap gap-2">
                {courses.filter(c=>!slotsByCourse[c.id]?.length).map(c=>{const color=getColor(c.id);return(
                  <button key={c.id} onClick={()=>openAdd({course_id:c.id})} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border hover:opacity-80 ${color.bg} ${color.text}`}>
                    <Plus className="h-3 w-3"/>{c.course_code}
                  </button>
                );})}
              </div>
            </CardContent></Card>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v=>{setDialogOpen(v);if(!v){setEditingSlot(null);setForm({...defaultForm});setFormErrors({});}}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingSlot?'Edit Schedule Slot':'Add Schedule Slot'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Course <span className="text-destructive">*</span></Label>
              <Select value={form.course_id} onValueChange={v=>setForm(f=>({...f,course_id:v}))} disabled={!!editingSlot}>
                <SelectTrigger className={formErrors.course_id?'border-destructive':''}><SelectValue placeholder="Select a course"/></SelectTrigger>
                <SelectContent>{courses.map(c=><SelectItem key={c.id} value={c.id}><span className="font-medium">{c.course_code}</span><span className="text-muted-foreground ml-2 text-xs">{c.course_name}</span></SelectItem>)}</SelectContent>
              </Select>
              {formErrors.course_id&&<p className="text-xs text-destructive">{formErrors.course_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Day of Week <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-7 gap-1">
                {DAYS_SHORT.map((d,i)=>(
                  <button key={d} type="button" onClick={()=>setForm(f=>({...f,day_of_week:String(i)}))}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${form.day_of_week===String(i)?'bg-primary text-primary-foreground border-primary':'border-muted hover:border-primary/40 hover:bg-primary/5'}`}>{d}</button>
                ))}
              </div>
              {formErrors.day_of_week&&<p className="text-xs text-destructive">{formErrors.day_of_week}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time <span className="text-destructive">*</span></Label>
                <Input type="time" value={form.start_time} onChange={e=>setForm(f=>({...f,start_time:e.target.value}))} className={formErrors.start_time?'border-destructive':''}/>
                {formErrors.start_time&&<p className="text-xs text-destructive">{formErrors.start_time}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>End Time <span className="text-destructive">*</span></Label>
                <Input type="time" value={form.end_time} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))} className={formErrors.end_time?'border-destructive':''}/>
                {formErrors.end_time&&<p className="text-xs text-destructive">{formErrors.end_time}</p>}
              </div>
            </div>
            {form.start_time&&form.end_time&&form.start_time<form.end_time&&(
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <Clock className="h-3.5 w-3.5"/>Duration: <span className="font-semibold text-foreground">{getDuration(form.start_time,form.end_time)}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Room / Location</Label>
              <Input placeholder="e.g. Room 301, Lab B" value={form.room_location} onChange={e=>setForm(f=>({...f,room_location:e.target.value}))}/>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={()=>setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving?<div className="flex items-center gap-2"><div className="animate-spin rounded-full h-3 w-3 border-b border-primary-foreground"/>Saving…</div>
                :editingSlot?<><CheckCircle className="h-4 w-4 mr-2"/>Update Slot</>:<><Plus className="h-4 w-4 mr-2"/>Add Slot</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirmId} onOpenChange={v=>{if(!v)setDeleteConfirmId(null);}}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Schedule Slot?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the recurring slot. Past attendance records won't be affected.</p>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={()=>setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={()=>deleteConfirmId&&handleDelete(deleteConfirmId)}><Trash2 className="h-4 w-4 mr-2"/>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TimetableManager;