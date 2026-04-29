import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  MessageSquare, 
  FileText, 
  Target, 
  ChevronRight, 
  LogOut, 
  Trash2, 
  UserPlus,
  ArrowLeft,
  Save,
  X,
  Loader2,
  Clock,
  User as UserIcon
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCourses } from '../contexts/CourseContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  db, 
  handleFirestoreError, 
  OperationType,
  Timestamp,
  serverTimestamp
} from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc, 
  updateDoc,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { toast } from 'sonner';

interface Group {
  id: string;
  name: string;
  courseId: string;
  description: string;
  createdBy: string;
  createdAt: any;
  memberCount: number;
  zoomUrl?: string;
}

interface Note {
  id: string;
  groupId: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: any;
}

interface StudyPlan {
  id: string;
  groupId: string;
  title: string;
  steps: any[];
  createdAt: any;
}

export const StudyGroupsView: React.FC = () => {
  const { t, language } = useLanguage();
  const { courses } = useCourses();
  const { user, loginWithGoogle, loginWithApple, loading: authLoading } = useAuth();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCourse, setNewGroupCourse] = useState(courses[0]?.title || '');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  
  // Group Details State
  const [groupNotes, setGroupNotes] = useState<Note[]>([]);
  const [groupPlans, setGroupPlans] = useState<StudyPlan[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'notes' | 'plans' | 'members'>('notes');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [tempZoomUrl, setTempZoomUrl] = useState('');

  useEffect(() => {
    if (!user) return;

    // Fetch My Groups
    const myGroupsQuery = query(
      collection(db, 'groups'),
      // In a real app, we'd query the members subcollection, but for simplicity
      // we'll fetch groups where the user is the creator or we'll fetch all and filter
      // Better: query the members collection across all groups
    );

    // This is a bit complex for Firestore without a dedicated "my_memberships" collection
    // Let's simplify: fetch all groups for now, or fetch groups created by me.
    // Real implementation would use a collectionGroup query or a separate memberships collection.
    
    const unsubscribeGroups = onSnapshot(collection(db, 'groups'), (snapshot) => {
      const allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      
      // For now, let's just show all groups as available and filter "my groups" 
      // based on whether a membership doc exists. This is inefficient but works for a demo.
      // We'll actually listen to memberships for the current user.
      setAvailableGroups(allGroups);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'groups');
      setLoading(false);
    });

    return () => unsubscribeGroups();
  }, [user]);

  const handleCreateGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    
    try {
      const groupData = {
        name: newGroupName,
        courseId: newGroupCourse,
        description: newGroupDesc,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        memberCount: 1
      };
      
      const docRef = await addDoc(collection(db, 'groups'), groupData);
      
      // Add creator as admin member
      await setDoc(doc(db, `groups/${docRef.id}/members`, user.uid), {
        userId: user.uid,
        role: 'admin',
        joinedAt: serverTimestamp()
      });
      
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
      toast.success('Group created successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'groups');
    }
  };

  const handleJoinGroup = async (group: Group) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `groups/${group.id}/members`, user.uid), {
        userId: user.uid,
        role: 'member',
        joinedAt: serverTimestamp()
      });
      toast.success(`Joined ${group.name}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `groups/${group.id}/members`);
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `groups/${groupId}/members`, user.uid));
      setSelectedGroup(null);
      toast.success('Left group');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}/members`);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      setSelectedGroup(null);
      toast.success('Group deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
    }
  };

  // Group Details Listeners
  useEffect(() => {
    if (!selectedGroup) return;

    const unsubNotes = onSnapshot(
      query(collection(db, `groups/${selectedGroup.id}/notes`), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setGroupNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `groups/${selectedGroup.id}/notes`);
      }
    );

    const unsubPlans = onSnapshot(
      query(collection(db, `groups/${selectedGroup.id}/plans`), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setGroupPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyPlan)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `groups/${selectedGroup.id}/plans`);
      }
    );

    const unsubMembers = onSnapshot(
      collection(db, `groups/${selectedGroup.id}/members`),
      (snapshot) => {
        setGroupMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `groups/${selectedGroup.id}/members`);
      }
    );

    return () => {
      unsubNotes();
      unsubPlans();
      unsubMembers();
    };
  }, [selectedGroup]);

  const handleSaveNote = async () => {
    if (!user || !selectedGroup || !noteTitle.trim()) return;
    
    try {
      const noteData = {
        groupId: selectedGroup.id,
        title: noteTitle,
        content: noteContent,
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous',
        createdAt: editingNote ? editingNote.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (editingNote) {
        await updateDoc(doc(db, `groups/${selectedGroup.id}/notes`, editingNote.id), noteData);
      } else {
        await addDoc(collection(db, `groups/${selectedGroup.id}/notes`), noteData);
      }

      setShowNoteModal(false);
      setNoteTitle('');
      setNoteContent('');
      setEditingNote(null);
      toast.success('Note saved!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `groups/${selectedGroup.id}/notes`);
    }
  };

  const handleUpdateZoom = async () => {
    if (!user || !selectedGroup) return;
    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id), {
        zoomUrl: tempZoomUrl
      });
      setSelectedGroup({ ...selectedGroup, zoomUrl: tempZoomUrl });
      setShowZoomModal(false);
      toast.success('Enlace de Zoom actualizado');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${selectedGroup.id}`);
    }
  };

  if (authLoading || (user && loading)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-on-surface-variant font-medium">Cargando Grupos de Estudio...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center max-w-md mx-auto">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
          <Users className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-on-surface">Grupos de Estudio</h2>
          <p className="text-on-surface-variant">Únete a grupos de estudio colaborativos para compartir notas y resolver dudas.</p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-8 py-3 bg-white text-on-surface border border-outline-variant rounded-2xl font-bold shadow-sm hover:bg-surface-variant/20 transition-all active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Continuar con Google
          </button>
          <button
            onClick={loginWithApple}
            className="w-full flex items-center justify-center gap-3 px-8 py-3 bg-black text-white rounded-2xl font-bold shadow-sm hover:bg-black/90 transition-all active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 384 512" fill="currentColor">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            Continuar con Apple
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="responsive-container space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight flex items-center justify-center md:justify-start gap-3">
            <Users className="w-8 h-8 text-primary" />
            Grupos de Estudio
          </h1>
          <p className="text-xs md:text-sm text-on-surface-variant mt-2 max-w-2xl mx-auto md:mx-0">
            Únete a grupos de estudio colaborativos para compartir notas y resolver dudas.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 w-full md:w-auto"
        >
          <Plus className="w-5 h-5" />
          Crear Grupo
        </button>
      </header>

      <AnimatePresence mode="wait">
        {!selectedGroup ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-12"
          >
            {/* Search Bar */}
            <div className="relative w-full max-w-xl mx-auto px-4 md:px-0">
              <Search className="absolute left-8 md:left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar grupos por nombre o curso..."
                className="w-full pl-12 pr-4 py-4 bg-card rounded-2xl border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm md:text-base"
              />
            </div>

            {/* Available Groups */}
            <section className="space-y-6 w-full flex flex-col items-center">
              <h2 className="text-xl font-bold text-on-surface flex items-center gap-2 self-start md:self-center lg:self-start">
                <Search className="w-5 h-5 text-primary" />
                Grupos Disponibles
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {availableGroups.length > 0 ? (
                  availableGroups.map(group => (
                    <motion.div
                      key={group.id}
                      whileHover={{ y: -4 }}
                      className="responsive-card glass-panel p-6 rounded-3xl border-l-4 border-primary flex flex-col h-full"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-primary/10 text-primary rounded-md">
                          {group.courseId}
                        </span>
                        <div className="flex items-center gap-1 text-on-surface-variant text-xs font-medium">
                          <UserIcon className="w-3 h-3" />
                          {group.memberCount || 1}
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-on-surface mb-2">{group.name}</h3>
                      <p className="text-sm text-on-surface-variant line-clamp-2 mb-6 flex-1">
                        {group.description}
                      </p>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-outline-variant/10">
                        <button
                          onClick={() => setSelectedGroup(group)}
                          className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          Ver Detalles
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleJoinGroup(group)}
                          className="px-4 py-2 bg-surface-variant text-on-surface-variant rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all"
                        >
                          Unirse
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center text-on-surface-variant opacity-50">
                    <p>No hay grupos disponibles en este momento.</p>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <button
              onClick={() => setSelectedGroup(null)}
              className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors font-bold text-sm uppercase tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a Grupos
            </button>

            <div className="responsive-card glass-panel p-4 md:p-8 rounded-[2.5rem] space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex flex-col md:flex-row items-center gap-3">
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest px-3 py-1 bg-primary/10 text-primary rounded-full">
                      {selectedGroup.courseId}
                    </span>
                    <h2 className="text-xl md:text-3xl font-bold text-on-surface">{selectedGroup.name}</h2>
                  </div>
                  <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl mx-auto md:mx-0">{selectedGroup.description}</p>
                </div>
                <div className="flex flex-wrap justify-center md:justify-end gap-3">
                  {selectedGroup.zoomUrl ? (
                    <a
                      href={selectedGroup.zoomUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 text-xs md:text-sm"
                    >
                      <svg className="w-4 h-4 md:w-5 md:h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                      </svg>
                      Unirse a Zoom
                    </a>
                  ) : selectedGroup.createdBy === user.uid && (
                    <button
                      onClick={() => {
                        setTempZoomUrl('');
                        setShowZoomModal(true);
                      }}
                      className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-blue-100 text-blue-600 rounded-2xl font-bold hover:bg-blue-200 transition-all text-xs md:text-sm"
                    >
                      Configurar Zoom
                    </button>
                  )}
                  {selectedGroup.createdBy === user.uid ? (
                    <button
                      onClick={() => handleDeleteGroup(selectedGroup.id)}
                      className="p-2 md:p-3 text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                      title="Eliminar Grupo"
                    >
                      <Trash2 className="w-5 h-5 md:w-6 md:h-6" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLeaveGroup(selectedGroup.id)}
                      className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-surface-variant text-on-surface-variant rounded-2xl font-bold hover:bg-red-50 hover:text-red-500 transition-all text-xs md:text-sm"
                    >
                      <LogOut className="w-4 h-4 md:w-5 md:h-5" />
                      Abandonar Grupo
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex-wrap-center gap-2 p-1 bg-surface-variant/30 rounded-2xl w-full">
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 text-xs md:text-sm ${
                    activeTab === 'notes' 
                      ? 'bg-card text-primary shadow-sm' 
                      : 'text-on-surface-variant hover:bg-card/50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Notas
                </button>
                <button
                  onClick={() => setActiveTab('plans')}
                  className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 text-xs md:text-sm ${
                    activeTab === 'plans' 
                      ? 'bg-card text-primary shadow-sm' 
                      : 'text-on-surface-variant hover:bg-card/50'
                  }`}
                >
                  <Target className="w-4 h-4" />
                  Planes
                </button>
                <button
                  onClick={() => setActiveTab('members')}
                  className={`px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 text-xs md:text-sm ${
                    activeTab === 'members' 
                      ? 'bg-card text-primary shadow-sm' 
                      : 'text-on-surface-variant hover:bg-card/50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Miembros
                </button>
              </div>

              {/* Tab Content */}
              <div className="min-h-[400px]">
                {activeTab === 'notes' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold text-on-surface">Notas</h3>
                      <button
                        onClick={() => {
                          setEditingNote(null);
                          setNoteTitle('');
                          setNoteContent('');
                          setShowNoteModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar Nota
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupNotes.map(note => (
                        <div key={note.id} className="p-6 bg-surface rounded-2xl border border-outline-variant/30 hover:border-primary/30 transition-all group">
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="font-bold text-on-surface text-lg">{note.title}</h4>
                            {(note.authorId === user.uid || selectedGroup.createdBy === user.uid) && (
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingNote(note);
                                    setNoteTitle(note.title);
                                    setNoteContent(note.content);
                                    setShowNoteModal(true);
                                  }}
                                  className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    toast("¿Eliminar nota?", {
                                      action: {
                                        label: "Eliminar",
                                        onClick: async () => {
                                          try {
                                            await deleteDoc(doc(db, `groups/${selectedGroup.id}/notes`, note.id));
                                            toast.success('Note deleted');
                                          } catch (error) {
                                            handleFirestoreError(error, OperationType.DELETE, `groups/${selectedGroup.id}/notes/${note.id}`);
                                          }
                                        }
                                      }
                                    });
                                  }}
                                  className="p-2 text-on-surface-variant hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-on-surface-variant line-clamp-4 mb-6 whitespace-pre-wrap">
                            {note.content}
                          </p>
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                            <div className="flex items-center gap-1">
                              <UserIcon className="w-3 h-3" />
                              {note.authorName}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {note.createdAt?.toDate().toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'plans' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold text-on-surface">Planes</h3>
                      <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all">
                        <Plus className="w-4 h-4" />
                        Agregar Plan
                      </button>
                    </div>
                    <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant opacity-40">
                      <Target className="w-12 h-12 mb-4" />
                      <p>Próximamente: Colaboración en Planes de Estudio</p>
                    </div>
                  </div>
                )}

                {activeTab === 'members' && (
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-on-surface">Miembros</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {groupMembers.map(member => (
                        <div key={member.id} className="flex items-center gap-4 p-4 bg-surface rounded-2xl border border-outline-variant/30">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {member.userId.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-on-surface">Usuario {member.userId.substring(0, 5)}</p>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${member.role === 'admin' ? 'text-primary' : 'text-on-surface-variant'}`}>
                              {member.role === 'admin' ? 'Administrador' : 'Miembro'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Group Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-lg bg-card rounded-[2.5rem] shadow-2xl p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-on-surface">Crear Nuevo Grupo</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-surface-variant rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Nombre del Grupo</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Ej: Grupo de Estudio Biología"
                    className="w-full px-4 py-3 bg-surface rounded-xl border border-outline-variant outline-none focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Curso Relacionado</label>
                  <select
                    value={newGroupCourse}
                    onChange={(e) => setNewGroupCourse(e.target.value)}
                    className="w-full px-4 py-3 bg-surface rounded-xl border border-outline-variant outline-none focus:border-primary transition-all"
                  >
                    {courses.map(course => (
                      <option key={course.id} value={course.title}>{course.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Descripción del Grupo</label>
                  <textarea
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="Describe el propósito del grupo..."
                    className="w-full h-32 px-4 py-3 bg-surface rounded-xl border border-outline-variant outline-none focus:border-primary transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-surface-variant text-on-surface-variant rounded-xl font-bold hover:bg-surface-variant/80 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Note Modal */}
      <AnimatePresence>
        {showNoteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoteModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-2xl bg-card rounded-[2.5rem] shadow-2xl p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-on-surface">
                  {editingNote ? 'Editar Nota' : 'Agregar Nota'}
                </h2>
                <button onClick={() => setShowNoteModal(false)} className="p-2 hover:bg-surface-variant rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Título de la nota"
                  className="w-full px-4 py-3 bg-surface rounded-xl border border-outline-variant outline-none focus:border-primary text-lg font-bold transition-all"
                />
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Escribe aquí tus notas, dudas o recursos..."
                  className="w-full h-64 px-4 py-3 bg-surface rounded-xl border border-outline-variant outline-none focus:border-primary transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="flex-1 py-3 bg-surface-variant text-on-surface-variant rounded-xl font-bold hover:bg-surface-variant/80 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={!noteTitle.trim()}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  <Save className="w-5 h-5 inline-block mr-2" />
                  Guardar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Zoom Modal */}
      <AnimatePresence>
        {showZoomModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowZoomModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-[95%] max-w-md bg-card rounded-[2.5rem] shadow-2xl p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-on-surface">Configurar Zoom</h2>
                <button onClick={() => setShowZoomModal(false)} className="p-2 hover:bg-surface-variant rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">
                  Pega el enlace de tu reunión de Zoom para que otros miembros puedan unirse fácilmente.
                </p>
                <input
                  type="url"
                  value={tempZoomUrl}
                  onChange={(e) => setTempZoomUrl(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className="w-full px-4 py-3 bg-surface rounded-xl border border-outline-variant outline-none focus:border-primary transition-all"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowZoomModal(false)}
                  className="flex-1 py-3 bg-surface-variant text-on-surface-variant rounded-xl font-bold hover:bg-surface-variant/80 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateZoom}
                  disabled={!tempZoomUrl.startsWith('http')}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  Guardar Enlace
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
