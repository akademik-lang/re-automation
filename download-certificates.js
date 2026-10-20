import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { authorize, uploadFile } from './google-drive.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfigurasi dari .env
const LOGIN_URL = process.env.LOGIN_URL;
const CERT_URL = process.env.CERT_URL;
const USERNAME = process.env.MOODLE_USERNAME;
const PASSWORD = process.env.MOODLE_PASSWORD;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Buat folder downloads kalau belum ada
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

async function downloadCertificates() {
  console.log('🚀 Starting automation...');
  
  // Check if Google Drive is configured
  const useGoogleDrive = GOOGLE_DRIVE_FOLDER_ID && fs.existsSync(GOOGLE_CREDENTIALS_PATH) && fs.existsSync('token.json');
  
  let driveAuth = null;
  if (useGoogleDrive) {
    try {
      driveAuth = await authorize(GOOGLE_CREDENTIALS_PATH);
      console.log('✅ Google Drive connected');
    } catch (error) {
      console.log('⚠️  Google Drive not configured. Run: npm run setup-drive');
      console.log('   Files will be saved locally only.\n');
    }
  } else {
    console.log('⚠️  Google Drive not configured. Files will be saved locally only.\n');
  }
  
  // Launch browser with visible window
  const browser = await chromium.launch({
    headless: false, // Show browser window so you can see the progress
  });
  
  const context = await browser.newContext({
    acceptDownloads: true
  });
  
  // Set longer timeout for slow certificate generation
  context.setDefaultTimeout(120000); // 2 minutes timeout
  
  const page = await context.newPage();
  
  let apiContext = null;
  
  try {
    console.log('🔐 Logging in...');
    await page.goto(LOGIN_URL);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Extra wait for any dynamic content
    
    // Take screenshot for debugging
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'login-page.png'), fullPage: true });
    console.log('📸 Screenshot saved for debugging');
    
    // Debug: Get all input fields
    const inputs = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input'));
      return allInputs.map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        visible: input.offsetParent !== null,
        value: input.value
      }));
    });
    console.log('🔍 All input fields found:', JSON.stringify(inputs, null, 2));
    
    // Debug: Get the login form HTML
    const formHTML = await page.evaluate(() => {
      const form = document.querySelector('form');
      return form ? form.innerHTML : 'No form found';
    });
    console.log('📝 Form HTML snippet:', formHTML.substring(0, 500));
    
    // Fill login form - try ID selectors
    const usernameField = await page.locator('#username').count();
    const passwordField = await page.locator('#password').count();
    
    console.log(`Username field with #username: ${usernameField}`);
    console.log(`Password field with #password: ${passwordField}`);
    
    if (usernameField > 0 && passwordField > 0) {
      await page.fill('#username', USERNAME);
      await page.fill('#password', PASSWORD);
    } else {
      // Fallback to name selectors, but filter for visible text/password inputs
      const visibleUsername = page.locator('input[name="username"][type="text"]').first();
      const visiblePassword = page.locator('input[name="password"][type="password"]').first();
      
      await visibleUsername.fill(USERNAME);
      await visiblePassword.fill(PASSWORD);
    }
    
    console.log('✍️  Filled username and password');
    
    // Take screenshot after filling
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'login-filled.png'), fullPage: true });
    console.log('📸 Screenshot after filling saved');
    
    // Click login button - IMPORTANT: target the button in the form that contains #username
    // Not the guest login button
    await page.locator('form:has(#username) button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
    
    // Take screenshot after login
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'after-login.png'), fullPage: true });
    console.log('📸 After login screenshot saved');
    
    console.log('✅ Login process completed');
    
    // Step 2: Navigate to certificate page
    console.log('📄 Navigating to certificate page...');
    await page.goto(CERT_URL);
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of certificate page
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'cert-page.png') });
    console.log('📸 Certificate page screenshot saved');
    
    // Step 3: Get all rows from the table
    console.log('📊 Extracting student data...');
    
    // Get sesskey from page for authenticated downloads
    const sesskey = await page.evaluate(() => {
      const sesskeyInput = document.querySelector('input[name="sesskey"]');
      if (sesskeyInput) return sesskeyInput.value;
      
      // Try to find in URL or links
      const linkWithSesskey = document.querySelector('a[href*="sesskey="]');
      if (linkWithSesskey) {
        const match = linkWithSesskey.href.match(/sesskey=([^&]+)/);
        return match ? match[1] : null;
      }
      
      return null;
    });
    
    if (sesskey) {
      console.log(`🔑 Found sesskey: ${sesskey}`);
    } else {
      console.log('⚠️  No sesskey found, might cause authentication issues');
    }
    
    // Debug: check if table exists
    const tableExists = await page.locator('table#mod_customcert_report_table').count();
    console.log(`🔍 Tables found: ${tableExists}`);
    
    // If table doesn't exist, try alternative selectors
    if (tableExists === 0) {
      console.log('⚠️  Table not found with ID, trying alternative selectors...');
      const allTables = await page.locator('table').count();
      console.log(`📋 Total tables on page: ${allTables}`);
      
      // Get table structure
      const tableInfo = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table'));
        return tables.map(table => ({
          id: table.id,
          className: table.className,
          rowCount: table.querySelectorAll('tr').length,
          firstRowHTML: table.querySelector('tr') ? table.querySelector('tr').innerHTML.substring(0, 200) : 'No rows'
        }));
      });
      console.log('📊 Table structures:', JSON.stringify(tableInfo, null, 2));
      
      // Take screenshot to see the page
      await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'table-debug.png'), fullPage: true });
      console.log('📸 Full page screenshot saved for debugging');
    }
    
    const students = await page.evaluate((sesskeyParam) => {
      // Store sesskey for use in download URLs
      window.sesskeyForDownload = sesskeyParam;
      // Try multiple selectors
      let rows = document.querySelectorAll('table#mod_customcert_report_table tbody tr');
      
      // If not found, try generic table selector
      if (rows.length === 0) {
        console.log('Trying alternative: table tbody tr');
        rows = document.querySelectorAll('table tbody tr');
      }
      
      // If still not found, try any table rows
      if (rows.length === 0) {
        console.log('Trying alternative: table tr');
        rows = document.querySelectorAll('table tr');
      }
      
      console.log('Total rows found:', rows.length);
      
      console.log('Total rows found:', rows.length);
      const data = [];
      
      rows.forEach((row, index) => {
        // Skip header row if exists
        if (row.querySelector('th')) {
          console.log('Skipping header row:', index);
          return;
        }
        
        // Try multiple cell selector strategies
        const nameCell = row.querySelector('td.c0') || row.querySelector('td:nth-child(1)');
        const downloadLink = row.querySelector('td.c4 a') || 
                            row.querySelector('a[href*="downloadissue"]') ||
                            row.querySelector('td a[title*="Download"]') ||
                            row.querySelector('td a i.fa-download')?.parentElement;
        
        console.log(`Row ${index}:`, {
          hasNameCell: !!nameCell,
          hasDownloadLink: !!downloadLink,
          nameText: nameCell?.textContent.substring(0, 50),
          downloadHref: downloadLink?.href
        });
        
        if (nameCell && downloadLink) {
          // Extract nama mahasiswa dari text content
          const fullText = nameCell.textContent.trim();
          // Remove image alt text jika ada, ambil nama setelah avatar
          const nameParts = fullText.split('\n').filter(part => part.trim());
          const studentName = nameParts[nameParts.length - 1].trim();
          
          let downloadUrl = downloadLink.href;
          
          // Add sesskey if available and not already in URL
          if (window.sesskeyForDownload && !downloadUrl.includes('sesskey=')) {
            downloadUrl += (downloadUrl.includes('?') ? '&' : '?') + 'sesskey=' + window.sesskeyForDownload;
          }
          
          data.push({
            name: studentName,
            downloadUrl: downloadUrl
          });
        }
      });
      
      return data;
    }, sesskey);
    
    console.log(`📋 Found ${students.length} students`);
    
    // Debug: print first student data
    if (students.length > 0) {
      console.log('📝 Sample student data:', students[0]);
    }
    
    // Step 4: Download certificates using a standalone API request context
    // This is independent from the browser page, so closing the browser won't kill downloads
    const { request: playwrightRequest } = await import('playwright');
    
    // Get cookies from the browser session
    const cookies = await context.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('🍪 Got session cookies');
    
    // Create a standalone request context with the session cookies
    apiContext = await playwrightRequest.newContext({
      extraHTTPHeaders: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 300000 // 5 minutes
    });
    console.log('\n🚀 Starting downloads... (This may take several minutes)');
    console.log('⏰ Estimated time: ~2-5 minutes per certificate\n');
    
    let successCount = 0;
    let errorCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const downloadStartTime = Date.now();
      console.log(`\n📥 [${i + 1}/${students.length}] Downloading certificate for: ${student.name}`);
      
      try {
        console.log(`   📍 URL: ${student.downloadUrl}`);
        console.log(`   ⏳ Requesting certificate... (may take 1-5 minutes, please wait)`);
        
        // Use standalone API context (independent from browser page)
        const response = await apiContext.get(student.downloadUrl, {
          timeout: 300000 // 5 minutes timeout
        });
        
        console.log(`   📡 HTTP Status: ${response.status()}`);
        console.log(`   📋 Content-Type: ${response.headers()['content-type']}`);
        
        if (response.ok()) {
          const buffer = await response.body();
          
          console.log(`   📦 Downloaded ${buffer.length} bytes`);
          
          // Check if response is actually a PDF (or other binary file)
          const contentType = response.headers()['content-type'] || '';
          
          if (contentType.includes('text/html')) {
            console.error(`   ❌ Error: Got HTML instead of PDF (might be error page or redirect)`);
            console.log(`   📝 First 500 chars of response: ${buffer.toString('utf8').substring(0, 500)}`);
            errorCount++;
            continue;
          }
          
          if (buffer.length < 1000) {
            console.error(`   ❌ Error: File too small (${buffer.length} bytes), probably not a valid certificate`);
            console.log(`   📝 Content: ${buffer.toString('utf8')}`);
            errorCount++;
            continue;
          }
          
          // Get filename from Content-Disposition header or default to .pdf
          const contentDisposition = response.headers()['content-disposition'];
          let ext = '.pdf';
          
          if (contentDisposition) {
            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match && match[1]) {
              const originalFilename = match[1].replace(/['"]/g, '');
              ext = path.extname(originalFilename) || '.pdf';
            }
          }
          
          // Sanitize student name untuk filename (keep spaces, only remove invalid chars)
          const sanitizedName = student.name
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove only Windows invalid filename chars
            .trim();
          
          // Save with student name
          const newFilename = `${sanitizedName}${ext}`;
          const savePath = path.join(DOWNLOAD_DIR, newFilename);
          
          fs.writeFileSync(savePath, buffer);
          const downloadTime = ((Date.now() - downloadStartTime) / 1000).toFixed(1);
          console.log(`   ✅ Saved locally: ${newFilename} (${buffer.length} bytes)`);
          console.log(`   ⏱️  Download time: ${downloadTime}s`);
          successCount++;
          
          // Upload to Google Drive if configured
          if (driveAuth && GOOGLE_DRIVE_FOLDER_ID) {
            try {
              console.log(`   ☁️  Uploading to Google Drive...`);
              const uploadResult = await uploadFile(driveAuth, savePath, newFilename, GOOGLE_DRIVE_FOLDER_ID);
              
              if (uploadResult.success) {
                console.log(`   ✅ Uploaded to Drive: ${uploadResult.webViewLink}`);
              } else {
                console.log(`   ⚠️  Drive upload failed: ${uploadResult.error}`);
              }
            } catch (uploadError) {
              console.log(`   ⚠️  Drive upload error: ${uploadError.message}`);
            }
          }
          
        } else {
          console.error(`   ❌ HTTP ${response.status()} for ${student.name}`);
          errorCount++;
        }
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`   ❌ Error downloading for ${student.name}:`, error.message);
        errorCount++;
      }
      
      // Show progress summary every 5 downloads
      if ((i + 1) % 5 === 0 || i === students.length - 1) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const avgTimePerDownload = (Date.now() - startTime) / (i + 1) / 1000;
        const remaining = students.length - (i + 1);
        const estimatedMinutesLeft = (remaining * avgTimePerDownload / 60).toFixed(1);
        
        console.log(`\n📊 Progress: ${i + 1}/${students.length} | ✅ ${successCount} | ❌ ${errorCount} | ⏱️  ${elapsed}min elapsed | ~${estimatedMinutesLeft}min remaining`);
      }
    }
    
    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('\n\n🎉 All downloads completed!');
    console.log(`📊 Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   📋 Total: ${students.length}`);
    console.log(`   ⏱️  Total time: ${totalTime} minutes`);
    console.log(`📁 Files saved to: ${DOWNLOAD_DIR}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (apiContext) await apiContext.dispose();
    await browser.close();
  }
}

// Run the automation
downloadCertificates().catch(console.error);