import admin from 'firebase-admin';
import * as fs from 'fs';

async function checkVariations() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket
    });
  }

  const storage = admin.storage();
  const variations = [
    config.storageBucket,
    `${config.projectId}.firebasestorage.app`,
    `${config.projectId}.appspot.com`,
    config.projectId,
    `firebase-storage-${config.projectId}`,
    `storage-${config.projectId}`,
    `bucket-${config.projectId}`
  ].filter(Boolean);

  for (const name of variations) {
    try {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      console.log(`Bucket ${name} exists:`, exists);
      if (exists) {
        console.log(`FOUND ACTIVE BUCKET: ${name}`);
        break;
      }
    } catch (e: any) {
      console.error(`Error checking bucket ${name}:`, e.message);
    }
  }
}

checkVariations();
