import admin from 'firebase-admin';
import * as fs from 'fs';

async function findAnyBucket() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket
    });
  }

  const storage = admin.storage();
  const defaultBucket = storage.bucket();
  console.log('Default bucket name from admin.storage().bucket():', defaultBucket.name);
  
  const gcs = defaultBucket.storage;

  try {
    console.log('Attempting to list all buckets for project:', config.projectId);
    const [buckets] = await gcs.getBuckets();
    console.log('Found buckets:');
    buckets.forEach(b => console.log(' - ' + b.name));
    
    if (buckets.length > 0) {
      console.log('Updating config with the first found bucket:', buckets[0].name);
      config.storageBucket = buckets[0].name;
      fs.writeFileSync('./firebase-applet-config.json', JSON.stringify(config, null, 2));
    }
  } catch (e: any) {
    console.error('Error listing buckets:', e.message);
    if (e.errors) {
      console.error('Detailed errors:', JSON.stringify(e.errors, null, 2));
    }
  }
}

findAnyBucket();
