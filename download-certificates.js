import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfigurasi
const LOGIN_URL = 'https://usi-re.mandiribelajar.co.id/login/index.php';
const CERT_URL = 'https://usi-re.mandiribelajar.co.id/mod/customcert/view.php?id=7040';
const USERNAME = 'faiq.re';
const PASSWORD = 'faiq.re1234';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Buat folder downloads kalau belum ada
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

async function downloadCertificates() {
  console.log('🚀 Starting automation...');
  
  // Launch browser
  const browser = await chromium.launch({
    headless: false, // Set true kalau mau background
  });
  
  const context = await browser.newContext({
    acceptDownloads: true
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Login
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
    
    const students = await page.evaluate(() => {
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
          
          const downloadUrl = downloadLink.href;
          
          data.push({
            name: studentName,
            downloadUrl: downloadUrl
          });
        }
      });
      
      return data;
    });
    
    console.log(`📋 Found ${students.length} students`);
    
    // Debug: print first student data
    if (students.length > 0) {
      console.log('📝 Sample student data:', students[0]);
    }
    
    // Step 4: Download each certificate using fetch with browser cookies
    // Get cookies from the browser session
    const cookies = await context.cookies();
    
    // Convert cookies to header format
    const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    console.log('🍪 Got session cookies');
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      console.log(`\n📥 [${i + 1}/${students.length}] Downloading certificate for: ${student.name}`);
      
      try {
        console.log(`   📍 URL: ${student.downloadUrl}`);
        
        // Use page.request to download with same session
        const response = await page.request.get(student.downloadUrl);
        
        if (response.ok()) {
          const buffer = await response.body();
          
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
          
          console.log(`   📦 Downloaded ${buffer.length} bytes`);
          
          // Sanitize student name untuk filename
          const sanitizedName = student.name
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
            .replace(/\s+/g, '_') // Replace spaces with underscore
            .trim();
          
          // Save with student name
          const newFilename = `${sanitizedName}${ext}`;
          const savePath = path.join(DOWNLOAD_DIR, newFilename);
          
          fs.writeFileSync(savePath, buffer);
          console.log(`   ✅ Saved as: ${newFilename}`);
          
        } else {
          console.error(`   ❌ HTTP ${response.status()} for ${student.name}`);
        }
        
        // Small delay to avoid overwhelming the server
        await page.waitForTimeout(1000);
        
      } catch (error) {
        console.error(`   ❌ Error downloading for ${student.name}:`, error.message);
      }
    }
    
    console.log('\n\n🎉 All downloads completed!');
    console.log(`📁 Files saved to: ${DOWNLOAD_DIR}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

// Run the automation
downloadCertificates().catch(console.error);
