import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, storage, Timestamp } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from 'firebase/storage';
import { Course, Task, AIActivity, Exam, CourseFile, ExamQuestion } from '../types';
import { useLanguage } from './LanguageContext';
import { useAuth } from './AuthContext';
import { checkRateLimit } from '../lib/rateLimit';
import { toast } from 'sonner';
import axios from 'axios';

interface CourseContextType {
  courses: Course[];
  tasks: Task[];
  activities: AIActivity[];
  exams: Exam[];
  userFiles: CourseFile[];
  addCourse: (course: Omit<Course, 'id' | 'progress' | 'userId' | 'createdAt'>, id?: string, onProgress?: (progress: number) => void) => Promise<void>;
  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  addActivity: (activity: Omit<AIActivity, 'id' | 'time' | 'timestamp'>) => Promise<void>;
  updateCourseProgress: (id: string, progress: number) => Promise<void>;
  updateCourse: (id: string, updates: Partial<Course>) => Promise<void>;
  getCourseContent: (id: string) => Promise<{ summary?: string; theory?: string; examples?: string; exams?: ExamQuestion[]; exercises?: string; diagram?: string; podcastScript?: string } | null>;
  addFileToCourse: (courseId: string, file: File, onProgress?: (progress: number) => void) => Promise<void>;
  removeFileFromCourse: (courseId: string, fileId: string) => Promise<void>;
  addGeneralFile: (file: File, onProgress?: (progress: number) => void) => Promise<void>;
  removeGeneralFile: (fileId: string) => Promise<void>;
  addExam: (exam: Omit<Exam, 'id'>) => Promise<void>;
  deleteExam: (id: string) => Promise<void>;
  setExams: (exams: Exam[] | ((prev: Exam[]) => Exam[])) => void;
}

const CourseContext = createContext<CourseContextType | undefined>(undefined);

export const CourseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<AIActivity[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [userFiles, setUserFiles] = useState<CourseFile[]>([]);

  // Sync with Firestore
  useEffect(() => {
    if (!user) {
      setCourses([]);
      setTasks([]);
      setActivities([]);
      setExams([]);
      setUserFiles([]);
      return;
    }

    const qCourses = query(collection(db, 'user_courses'), where('userId', '==', user.uid));
    const unsubCourses = onSnapshot(qCourses, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Course));
      setCourses(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'user_courses'));

    const qTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task));
      setTasks(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    const qActivities = query(collection(db, 'activities'), where('userId', '==', user.uid));
    const unsubActivities = onSnapshot(qActivities, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AIActivity));
      setActivities(data.sort((a, b) => b.timestamp - a.timestamp));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'activities'));

    const qExams = query(collection(db, 'exams'), where('userId', '==', user.uid));
    const unsubExams = onSnapshot(qExams, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Exam));
      setExams(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'exams'));

    const qUserFiles = query(collection(db, 'userFiles'), where('userId', '==', user.uid));
    const unsubUserFiles = onSnapshot(qUserFiles, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CourseFile));
      setUserFiles(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'userFiles'));

    return () => {
      unsubCourses();
      unsubTasks();
      unsubActivities();
      unsubExams();
      unsubUserFiles();
    };
  }, [user]);

  const uploadViaProxy = async (
    storagePath: string,
    file: File,
    onProgress?: (progress: number) => void,
    context: string = "General"
  ): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', storagePath);

    try {
      const response = await axios.post('/api/storage/upload', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            if (onProgress) onProgress(progress);
          }
        }
      });
      
      if (!response.data || !response.data.url) {
        throw new Error("Proxy upload returned no URL");
      }
      
      return response.data.url;
    } catch (error) {
      console.error(`[CourseContext] [${context}] Proxy upload failed for ${file.name}:`, error);
      throw error;
    }
  };

  const uploadFileWithProgress = async (
    storageRef: any,
    file: File,
    onProgress?: (progress: number) => void,
    context: string = "General"
  ): Promise<string> => {
    // TRY PROXY FIRST since direct browser upload is having persistent CORS issues
    try {
      return await uploadViaProxy(storageRef.fullPath, file, onProgress, context);
    } catch (proxyError) {
      if (!storage) {
        throw new Error("Storage is not initialized");
      }

      try {
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        return await new Promise<string>((resolve, reject) => {
          // Add a timeout of 10 minutes
          const timeout = setTimeout(() => {
            // Try to cancel the task if it timed out
            try {
              uploadTask.cancel();
            } catch (e) {
              console.warn(`[CourseContext] [${context}] Failed to cancel uploadTask for ${file.name}:`, e);
            }
            reject(new Error(`Upload timeout for ${file.name}`));
          }, 600000);

          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              if (onProgress) onProgress(progress);
            }, 
            (error) => {
              clearTimeout(timeout);
              reject(error);
            }, 
            async () => {
              clearTimeout(timeout);
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      } catch (error) {
        throw error;
      }
    }
  };

  const addCourse = async (course: any, id?: string, onProgress?: (progress: number) => void) => {
    if (!user) return;
    if (!checkRateLimit()) {
      toast.error('Límite de peticiones excedido. Por favor espera un momento.');
      return;
    }
    try {
      const courseId = id || Date.now().toString();
      const uploadedFiles: CourseFile[] = [];

      // Handle file uploads if any
      if (course.files && course.files.length > 0) {
        for (let i = 0; i < course.files.length; i++) {
          const fileItem = course.files[i];
          
          // Extract the actual File object if it's wrapped
          const actualFile = fileItem instanceof File ? fileItem : (fileItem.file instanceof File ? fileItem.file : null);
          
          if (actualFile) {
            const fileId = `${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`;
            // Sanitize file name to avoid issues with special characters
            const sanitizedName = actualFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storageRef = ref(storage, `users/${user.uid}/courses/${courseId}/${fileId}_${sanitizedName}`);
            
            const downloadURL = await uploadFileWithProgress(storageRef, actualFile, onProgress, "CourseCreation");

            if (!downloadURL) {
              throw new Error(`Failed to get download URL for ${actualFile.name}`);
            }

            const newFile: CourseFile = {
              id: fileId,
              name: actualFile.name,
              type: actualFile.type,
              url: downloadURL,
              size: actualFile.size,
              userId: user.uid,
              createdAt: Timestamp.now()
            };
            uploadedFiles.push(newFile);
            
            // Also add to general userFiles for persistence
            await setDoc(doc(db, 'userFiles', fileId), newFile);
          } else {
            uploadedFiles.push({ ...fileItem, url: fileItem.url || '' });
          }
        }
      }

      const courseData: Omit<Course, 'id'> = {
        title: course.title || '',
        subtitle: course.subtitle || '',
        type: course.type || 'Otros',
        icon: course.icon || 'BookOpen',
        color: course.color || 'bg-primary',
        studyLevel: course.studyLevel || 'Universidad',
        userId: user.uid,
        progress: 0,
        status: 'en progreso',
        createdAt: Timestamp.now(),
        files: uploadedFiles.map(f => ({ ...f, url: f.url || '' })),
        exams: course.exams || [],
        completedSections: {
          theory: false,
          podcast: false,
          exam: false
        }
      };
      
      await setDoc(doc(db, 'user_courses', courseId), courseData);

      await addActivity({
        title: 'Nuevo Curso: ' + course.title,
        description: 'Contenido generado con éxito',
        type: 'summary'
      });
    } catch (error) {
      console.error("[CourseContext] Error in addCourse:", error);
      handleFirestoreError(error, OperationType.CREATE, 'user_courses');
    }
  };

  const addTask = async (newTask: Omit<Task, 'id'>) => {
    if (!user) return;
    if (!checkRateLimit()) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        ...newTask,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const toggleTask = async (id: string) => {
    if (!user) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      await updateDoc(doc(db, 'tasks', id), {
        completed: !task.completed
      });
      
      await addActivity({
        title: task.completed ? 'Tarea desmarcada' : 'Tarea completada',
        description: task.title,
        type: 'plan'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const addActivity = async (activity: Omit<AIActivity, 'id' | 'time' | 'timestamp'>) => {
    if (!user) return;
    if (!checkRateLimit()) return;
    try {
      await addDoc(collection(db, 'activities'), {
        ...activity,
        userId: user.uid,
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
        time: 'Ahora'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'activities');
    }
  };

  const updateCourseProgress = async (id: string, progress: number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'user_courses', id), { 
        progress,
        status: progress === 100 ? 'completado' : 'en progreso'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `user_courses/${id}`);
    }
  };

  const calculateStudyHours = (theory: string = '', examQuestions: any[] = []) => {
    // Estimación: 1 hora por cada 5000 caracteres de teoría + 5 minutos por pregunta de examen
    const theoryHours = theory.length / 5000;
    const examHours = (examQuestions.length * 5) / 60;
    return Math.max(1, Math.round((theoryHours + examHours) * 10) / 10);
  };

  const updateCourse = async (id: string, updates: Partial<Course>) => {
    if (!user) return;
    try {
      const course = courses.find(c => c.id === id);
      
      // Separate large AI content to avoid Firestore 1MB limit
      const { summary, theory, examples, exams, podcastScript, ...mainUpdates } = updates;
      
      // Calculate hours if theory or exams are provided
      if (theory || exams) {
        const currentContent = await getCourseContent(id);
        const finalTheory = theory || currentContent?.theory || '';
        const finalExams = exams || currentContent?.exams || [];
        (mainUpdates as any).estimatedHours = calculateStudyHours(finalTheory, finalExams);
      }

      // Handle automatic progress if completedSections is updated
      if (updates.completedSections && course) {
        const sections = { ...course.completedSections, ...updates.completedSections };
        let progress = 0;
        if (sections.theory) progress += 40;
        if (sections.podcast) progress += 20;
        if (sections.exam) progress += 40;
        
        (mainUpdates as any).progress = progress;
        (mainUpdates as any).status = progress === 100 ? 'completado' : 'en progreso';
      }
      
      // Update main course document
      if (Object.keys(mainUpdates).length > 0) {
        await updateDoc(doc(db, 'user_courses', id), mainUpdates);
      }

      // Update AI content in subcollection if any
      if (summary !== undefined || theory !== undefined || examples !== undefined || exams !== undefined || podcastScript !== undefined || updates.exercises !== undefined || updates.diagram !== undefined) {
        const contentUpdates: any = {
          userId: user.uid,
          updatedAt: serverTimestamp()
        };
        if (summary !== undefined) contentUpdates.summary = summary;
        if (theory !== undefined) contentUpdates.theory = theory;
        if (examples !== undefined) contentUpdates.examples = examples;
        if (exams !== undefined) contentUpdates.exams = exams;
        if (podcastScript !== undefined) contentUpdates.podcastScript = podcastScript;
        if (updates.exercises !== undefined) contentUpdates.exercises = updates.exercises;
        if (updates.diagram !== undefined) contentUpdates.diagram = updates.diagram;
        
        await setDoc(doc(db, 'user_courses', id, 'content', 'ai_generated'), contentUpdates, { merge: true });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `user_courses/${id}`);
    }
  };

  const getCourseContent = async (id: string) => {
    if (!user) return null;
    try {
      const contentDoc = await getDoc(doc(db, 'user_courses', id, 'content', 'ai_generated'));
      if (contentDoc.exists()) {
        return contentDoc.data() as { summary?: string; theory?: string; examples?: string; exams?: ExamQuestion[]; exercises?: string; diagram?: string; podcastScript?: string };
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `user_courses/${id}/content/ai_generated`);
      return null;
    }
  };

  const addFileToCourse = async (courseId: string, file: File, onProgress?: (progress: number) => void) => {
    if (!user) return;
    if (!checkRateLimit()) {
      toast.error('Límite de peticiones excedido. Por favor espera un momento.');
      return;
    }
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    
    try {
      const fileId = Date.now().toString();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageRef = ref(storage, `users/${user.uid}/courses/${courseId}/${fileId}_${sanitizedName}`);
      
      const downloadURL = await uploadFileWithProgress(storageRef, file, onProgress, "AddFileToCourse");

      if (!downloadURL) {
        throw new Error(`Failed to get download URL for ${file.name}`);
      }

      const newFile: CourseFile = {
        id: fileId,
        name: file.name,
        type: file.type,
        url: downloadURL,
        size: file.size,
        userId: user.uid,
        createdAt: Timestamp.now()
      };

      // Add to course
      await updateDoc(doc(db, 'user_courses', courseId), {
        files: arrayUnion(newFile)
      });

      // Also add to general userFiles for persistence
      await setDoc(doc(db, 'userFiles', fileId), newFile);

      await addActivity({
        title: 'Archivo subido',
        description: `Se agregó "${file.name}" al curso`,
        type: 'summary'
      });
    } catch (error) {
      console.error(`[CourseContext] Error adding file to course:`, error);
      handleFirestoreError(error, OperationType.UPDATE, `courses/${courseId}`);
    }
  };

  const removeFileFromCourse = async (courseId: string, fileId: string) => {
    if (!user) return;
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    
    const file = course.files?.find(f => f.id === fileId);
    if (!file) return;

    try {
      // Delete from storage
      const fileRef = ref(storage, file.url);
      await deleteObject(fileRef);

      // Remove from Firestore
      await updateDoc(doc(db, 'user_courses', courseId), {
        files: arrayRemove(file)
      });

      await addActivity({
        title: 'Archivo eliminado',
        description: `Se eliminó "${file.name}" del curso`,
        type: 'summary'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `courses/${courseId}`);
    }
  };

  const addGeneralFile = async (file: File, onProgress?: (progress: number) => void) => {
    if (!user) return;
    if (!checkRateLimit()) {
      toast.error('Límite de peticiones excedido. Por favor espera un momento.');
      return;
    }
    try {
      const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageRef = ref(storage, `users/${user.uid}/files/${fileId}_${sanitizedName}`);
      
      const downloadURL = await uploadFileWithProgress(storageRef, file, onProgress, "GeneralUpload");

      if (!downloadURL) {
        throw new Error(`Failed to get download URL for ${file.name}`);
      }

      const newFile: CourseFile = {
        id: fileId,
        name: file.name,
        type: file.type,
        url: downloadURL,
        size: file.size,
        userId: user.uid,
        createdAt: Timestamp.now()
      };

      await setDoc(doc(db, 'userFiles', fileId), newFile);
      
      await addActivity({
        title: 'Archivo subido',
        description: `Se agregó "${file.name}" a Mis Archivos`,
        type: 'summary'
      });
    } catch (error) {
      console.error(`[CourseContext] General file upload failed:`, error);
      handleFirestoreError(error, OperationType.CREATE, 'userFiles');
    }
  };

  const removeGeneralFile = async (fileId: string) => {
    if (!user) return;
    const file = userFiles.find(f => f.id === fileId);
    if (!file) return;

    try {
      // Delete from storage
      const fileRef = ref(storage, file.url);
      await deleteObject(fileRef);

      // Remove from Firestore
      await deleteDoc(doc(db, 'userFiles', fileId));

      await addActivity({
        title: 'Archivo eliminado',
        description: `Se eliminó "${file.name}" de Mis Archivos`,
        type: 'summary'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `userFiles/${fileId}`);
    }
  };

  const addExam = async (exam: Omit<Exam, 'id'>) => {
    if (!user) return;
    if (!checkRateLimit()) return;
    try {
      await addDoc(collection(db, 'exams'), {
        ...exam,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    }
  };

  const deleteExam = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'exams', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exams/${id}`);
    }
  };

  return (
    <CourseContext.Provider value={{ 
      courses, 
      tasks, 
      activities, 
      exams,
      userFiles,
      addCourse, 
      addTask, 
      toggleTask, 
      addActivity, 
      updateCourseProgress,
      updateCourse,
      getCourseContent,
      addFileToCourse,
      removeFileFromCourse,
      addGeneralFile,
      removeGeneralFile,
      addExam,
      deleteExam,
      setExams
    }}>
      {children}
    </CourseContext.Provider>
  );
};

export const useCourses = () => {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error('useCourses must be used within a CourseProvider');
  }
  return context;
};
