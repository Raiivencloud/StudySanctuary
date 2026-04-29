import admin from 'firebase-admin';
import * as fs from 'fs';

async function checkBucket() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket
    });
  }

  const storage = admin.storage();
  const bucketNames = [
    config.storageBucket,
    `${config.projectId}.firebasestorage.app`,
    `${config.projectId}.appspot.com`,
    config.projectId
  ];

  for (const name of bucketNames) {
    try {
      console.log(`Checking bucket: ${name}`);
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      console.log(`Bucket ${name} exists: ${exists}`);
      if (exists) {
        const [metadata] = await bucket.getMetadata();
        console.log(`Bucket ${name} metadata:`, JSON.stringify(metadata, null, 2));
      }
    } catch (e: any) {
      console.error(`Error checking bucket ${name}:`, e.message);
    }
  }
}

checkBucket();
