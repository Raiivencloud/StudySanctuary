import admin from 'firebase-admin';
import * as fs from 'fs';

async function checkOldBucket() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket
    });
  }

  const storage = admin.storage();
  const oldBucketName = 'ai-studio-applet-webapp-6cc37.firebasestorage.app';
  const oldBucketName2 = 'ai-studio-applet-webapp-6cc37.appspot.com';
  
  for (const name of [oldBucketName, oldBucketName2]) {
    try {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      console.log(`Bucket ${name} exists:`, exists);
    } catch (e: any) {
      console.error(`Error checking bucket ${name}:`, e.message);
    }
  }
}

checkOldBucket();
