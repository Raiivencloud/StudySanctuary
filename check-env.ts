import * as fs from 'fs';

async function checkEnv() {
  console.log('Environment Variables:');
  Object.keys(process.env).forEach(key => {
    if (key.includes('FIREBASE') || key.includes('STORAGE') || key.includes('BUCKET') || key.includes('PROJECT')) {
      console.log(`${key}: ${process.env[key]}`);
    }
  });
}

checkEnv();
