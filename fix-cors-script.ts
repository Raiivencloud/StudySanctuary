import admin from 'firebase-admin';
import * as fs from 'fs';

async function fixCors() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: config.projectId,
      storageBucket: config.storageBucket
    });
  }

  const variations = [
    config.storageBucket,
    `${config.projectId}.firebasestorage.app`,
    `${config.projectId}.appspot.com`,
    config.projectId,
    'ai-studio-applet-webapp-6cc37.firebasestorage.app',
    'ai-studio-applet-webapp-6cc37.appspot.com'
  ].filter(Boolean);

  for (const name of variations) {
    console.log(`Attempting to fix CORS for bucket: ${name}`);
    const bucket = admin.storage().bucket(name);
    try {
      await bucket.setCorsConfiguration([
        {
          maxAgeSeconds: 3600,
          method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
          origin: ['*'],
          responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable', 'x-goog-meta-fileid'],
        },
      ]);
      console.log(`Successfully fixed CORS for bucket: ${name}`);
    } catch (error: any) {
      console.log(`Failed to fix CORS for bucket ${name}: ${error.message}`);
    }
  }
}

fixCors();
