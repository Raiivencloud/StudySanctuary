import admin from 'firebase-admin';
import * as fs from 'fs';

async function checkStorage() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  console.log('Config:', config);

  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket
    });
  }

  const storage = admin.storage();
  
  // 1. Try default bucket
  try {
    const defaultBucket = storage.bucket();
    console.log('Default bucket name:', defaultBucket.name);
    const [exists] = await defaultBucket.exists();
    console.log('Default bucket exists:', exists);
  } catch (e: any) {
    console.error('Error checking default bucket:', e.message);
  }

  // 2. Try variations
  const variations = [
    config.storageBucket,
    `${config.projectId}.firebasestorage.app`,
    `${config.projectId}.appspot.com`,
    config.projectId
  ];

  for (const name of variations) {
    try {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      console.log(`Bucket ${name} exists:`, exists);
      if (exists) {
        console.log(`Found existing bucket: ${name}`);
      } else {
        // Try to write a file to trigger creation
        console.log(`Attempting to write a file to bucket ${name} to trigger creation...`);
        const file = bucket.file('test.txt');
        await file.save('test content', { resumable: false });
        console.log(`Successfully wrote file to bucket ${name}!`);
      }
    } catch (e: any) {
      console.error(`Error checking/writing to bucket ${name}:`, e.message);
    }
  }

  // 3. Try to list all buckets (might fail due to permissions)
  try {
    console.log('Attempting to list all buckets...');
    const [buckets] = await (storage as any).getBuckets();
    console.log('All buckets:', buckets.map((b: any) => b.name));
  } catch (e: any) {
    console.error('Error listing buckets:', e.message);
  }
}

checkStorage();
