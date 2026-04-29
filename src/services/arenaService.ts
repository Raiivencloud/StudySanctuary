import { db, handleFirestoreError, OperationType, serverTimestamp, increment } from '../firebase';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  limit, 
  orderBy,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { ArenaQuestion, ArenaUserStats, ArenaCollectible, ArenaRankingEntry, StudyLevel } from '../types';
import { generateArenaQuestions } from './geminiService';

import { ARENA_BASE_CARDS } from '../constants';

export const getArenaUserStats = async (userId: string): Promise<ArenaUserStats> => {
  const statsRef = doc(db, 'arena_stats', userId);
  try {
    const statsDoc = await getDoc(statsRef);

    if (!statsDoc.exists()) {
      // Initialize base cards for new user
      const batch = writeBatch(db);
      const initialCollectibleIds: string[] = [];

      ARENA_BASE_CARDS.forEach(card => {
        const docRef = doc(collection(db, 'arena_collectibles'));
        batch.set(docRef, {
          ...card,
          userId,
          imageUrl: `https://picsum.photos/seed/arena_${card.rarity}_${card.name}/400/600`,
          unlockedAt: serverTimestamp()
        });
        initialCollectibleIds.push(docRef.id);
      });

      const initialStats: ArenaUserStats = {
        userId,
        lives: 3,
        maxLives: 3,
        streak: 0,
        maxStreak: 0,
        credits: 0,
        totalPoints: 0,
        levelPoints: {
          'Inicial': 0,
          'Secundario': 0,
          'Universidad': 0,
          'Master': 0
        },
        collectibles: initialCollectibleIds
      };
      batch.set(statsRef, initialStats);
      await batch.commit();
      return initialStats;
    }

    const data = statsDoc.data() as ArenaUserStats;
    
    // Check cooldown
    if (data.lives === 0 && data.cooldownUntil) {
      const cooldownDate = data.cooldownUntil.toDate ? data.cooldownUntil.toDate() : new Date(data.cooldownUntil);
      if (new Date() > cooldownDate) {
        // Cooldown finished, restore lives
        const updatedStats = {
          ...data,
          lives: 3,
          cooldownUntil: null
        };
        await updateDoc(statsRef, { lives: 3, cooldownUntil: null });
        return updatedStats;
      }
    }

    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `arena_stats/${userId}`);
    throw error;
  }
};

export const updateArenaUserStats = async (userId: string, updates: Partial<ArenaUserStats>) => {
  const statsRef = doc(db, 'arena_stats', userId);
  try {
    await updateDoc(statsRef, updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `arena_stats/${userId}`);
    throw error;
  }
};

export const getQuestionsForArena = async (category: string, level: StudyLevel): Promise<ArenaQuestion[]> => {
  try {
    const q = query(
      collection(db, 'arena_questions'), 
      where('category', '==', category),
      where('level', '==', level),
      limit(20)
    );
    
    const querySnapshot = await getDocs(q);
    let questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArenaQuestion));

    if (questions.length < 10) {
      console.log(`[Arena] Low stock for ${category} (${level}). Generating more...`);
      try {
        const newQuestions = await generateArenaQuestions(category, level);
        const batch = writeBatch(db);
        
        const formattedQuestions = newQuestions.map((q: any) => {
          const docRef = doc(collection(db, 'arena_questions'));
          const questionData = {
            ...q,
            category,
            level,
            createdAt: serverTimestamp()
          };
          batch.set(docRef, questionData);
          return { id: docRef.id, ...questionData };
        });
        
        await batch.commit();
        questions = [...questions, ...formattedQuestions];
      } catch (error) {
        console.error("Error generating arena questions:", error);
      }
    }

    // Shuffle questions
    return questions.sort(() => Math.random() - 0.5);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'arena_questions');
    throw error;
  }
};

export const updateRanking = async (userId: string, displayName: string, photoURL: string, points: number, level: StudyLevel) => {
  const rankingRef = doc(db, 'arena_rankings', `${level}_${userId}`);
  try {
    await setDoc(rankingRef, {
      userId,
      displayName,
      photoURL,
      points,
      level,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `arena_rankings/${level}_${userId}`);
    throw error;
  }
};

export const getTopRankings = async (level: StudyLevel, limitCount: number = 100): Promise<ArenaRankingEntry[]> => {
  try {
    const q = query(
      collection(db, 'arena_rankings'),
      where('level', '==', level),
      orderBy('points', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc, index) => ({
      ...doc.data(),
      rank: index + 1
    } as ArenaRankingEntry));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'arena_rankings');
    throw error;
  }
};

export const getKings = async (): Promise<Record<StudyLevel, ArenaRankingEntry | null>> => {
  const levels: StudyLevel[] = ['Inicial', 'Secundario', 'Universidad', 'Master'];
  const kings: any = {};
  
  try {
    for (const level of levels) {
      const q = query(
        collection(db, 'arena_rankings'),
        where('level', '==', level),
        orderBy('points', 'desc'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      kings[level] = querySnapshot.empty ? null : { ...querySnapshot.docs[0].data(), rank: 1 };
    }
    
    return kings;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'arena_rankings');
    throw error;
  }
};

export const dropCollectible = async (userId: string, streak: number): Promise<ArenaCollectible | null> => {
  if (streak < 15) return null;
  
  const rarities: ArenaCollectible['rarity'][] = ['Bronce', 'Plata', 'Oro', 'Fuego'];
  let rarity: ArenaCollectible['rarity'] = 'Bronce';
  
  if (streak >= 50) rarity = 'Fuego';
  else if (streak >= 35) rarity = 'Oro';
  else if (streak >= 25) rarity = 'Plata';

  const collectible: Omit<ArenaCollectible, 'id'> = {
    userId,
    name: `Carta de Racha ${streak}`,
    rarity,
    imageUrl: `https://picsum.photos/seed/arena_${rarity}_${streak}/400/600`,
    description: `Obtenida por una racha de ${streak} aciertos en la Arena.`,
    unlockedAt: serverTimestamp()
  };

  try {
    const docRef = await addDoc(collection(db, 'arena_collectibles'), collectible);
    
    // Update user stats with new collectible ID
    const statsRef = doc(db, 'arena_stats', userId);
    await updateDoc(statsRef, {
      collectibles: arrayUnion(docRef.id)
    });

    return { id: docRef.id, ...collectible } as ArenaCollectible;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'arena_collectibles');
    throw error;
  }
};

export const getUserCollectibles = async (userId: string): Promise<ArenaCollectible[]> => {
  try {
    const q = query(collection(db, 'arena_collectibles'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArenaCollectible));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'arena_collectibles');
    throw error;
  }
};

// Helper for arrayUnion
import { arrayUnion } from 'firebase/firestore';
