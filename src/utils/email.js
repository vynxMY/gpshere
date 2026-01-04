// ============================================
// 📋 EMAIL UTILITY WITH TEST MODE (Resend)
// ============================================
// Supports:
//  ✔ Real email sending via Resend
//  ✔ TAC_TEST_MODE = true → no email, return TAC in API response
// ============================================

const { Resend } = require('resend');
require('dotenv').config();

const isTestMode = process.env.TAC_TEST_MODE === 'true';

// Initialize Resend client (only if NOT in test mode)
let resend = null;
let emailConfigValid = false;

if (!isTestMode) {
  // Validate email configuration
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ Email configuration incomplete. TAC codes will be returned in API response.');
    console.warn('   Missing: RESEND_API_KEY');
    console.warn('   Please check your .env file and ensure RESEND_API_KEY is configured.');
  } else {
    resend = new Resend(process.env.RESEND_API_KEY);
    
    console.log(`📧 Resend email service configured`);
    
    // Verify email configuration on startup
    console.log(`📧 Email Configuration Check:`);
    console.log(`   API Key: ${process.env.RESEND_API_KEY ? 'SET' : 'NOT SET'}`);
    console.log(`   From Email: ${process.env.FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'NOT SET'}`);
    console.log(`   Test Mode: ${isTestMode ? 'ENABLED (emails disabled)' : 'DISABLED (emails enabled)'}`);
    
    emailConfigValid = true;
  }
} else {
  console.log('🔧 TAC_TEST_MODE is enabled - emails will not be sent');
}

// Get from email address
const getFromEmail = () => {
  return process.env.FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'noreply@example.com';
};

// ============================================
// 📌 SEND TAC EMAIL (Supports Test Mode)
// ============================================
const sendTACEmail = async (email, tacCode) => {
  // TEST MODE: do not send email
  if (isTestMode) {
    console.log(`🔧 [TEST MODE] TAC for ${email}: ${tacCode}`);
    return {
      test: true,
      tac: tacCode
    };
  }

  // PRODUCTION MODE: send email normally
  if (!resend) {
    console.error(`❌ Resend client not configured!`);
    console.error(`   Missing: RESEND_API_KEY`);
    console.error(`   TAC Code (fallback): ${tacCode}`);
    return {
      test: true,
      tac: tacCode,
      reason: 'Email service not configured - missing RESEND_API_KEY',
      emailFailed: true
    };
  }

  // Retry logic for connection issues
  const maxRetries = 2;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 Retrying email send (attempt ${attempt}/${maxRetries})...`);
      }

      const { data, error } = await resend.emails.send({
        from: `GPS UTM <${getFromEmail()}>`,
        to: email,
        subject: '🔐 GPS UTM - Your Authentication Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #10b981; border-radius: 10px;">
            <h2 style="color: #059669; text-align: center;">🎓 Gerakan Pengguna Siswa UTM</h2>
            <h3 style="text-align: center; color: #333;">Student Consumer Movement</h3>
            <hr style="border: 1px solid #10b981;">
            <h2 style="color: #333;">Two-Factor Authentication</h2>
            <p style="font-size: 16px;">Your TAC (Time-based Authentication Code) is:</p>
            <div style="background: #f0fdf4; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="color: #059669; letter-spacing: 10px; font-size: 48px; margin: 0;">${tacCode}</h1>
            </div>
            <p style="color: #d97706; font-weight: bold;">⏰ This code expires in 15 minutes.</p>
            <p style="color: #666;">If you didn't request this code, please ignore this email.</p>
            <hr style="border: 1px solid #e5e7eb; margin-top: 30px;">
            <p style="text-align: center; color: #999; font-size: 12px;">
              © 2025 Gerakan Pengguna Siswa UTM<br>
              Empowering students to become smart, ethical, and responsible consumers
            </p>
          </div>
        `
      });

      if (error) {
        throw error;
      }

      console.log(`✅ TAC email sent to ${email}`);
      return { test: false };
    } catch (error) {
      lastError = error;
      console.error(`❌ Email sending failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Retry on network errors
      if (attempt < maxRetries && (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ECONN'))) {
        const delay = attempt * 3000; // Exponential backoff: 3s, 6s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a retryable error or max retries reached, break
      break;
    }
  }
  
  // All retries failed - return TAC in response so user can still log in
  console.error(`❌ Email sending failed after ${maxRetries} attempts for ${email}`);
  console.error(`   Last error: ${lastError?.message || 'Unknown error'}`);
  console.error(`   TAC Code (fallback): ${tacCode}`);
  
  // Provide user-friendly error message
  let userFriendlyError = 'Email sending failed';
  if (lastError?.message?.includes('API key')) {
    userFriendlyError = 'Email service authentication failed. Please check RESEND_API_KEY configuration.';
  } else if (lastError?.message?.includes('domain')) {
    userFriendlyError = 'Email domain not verified. Please verify your domain in Resend dashboard.';
  }
  
  return {
    test: true, // Mark as test so TAC is returned to user
    tac: tacCode,
    reason: userFriendlyError,
    detailedError: `${lastError?.message || 'Unknown error'}`,
    emailFailed: true
  };
};

// ============================================
// 📌 SEND PASSWORD RESET EMAIL (Supports Test Mode)
// ============================================
const sendResetEmail = async (email, resetCode) => {
  // TEST MODE: do not send email
  if (isTestMode) {
    console.log(`🔧 [TEST MODE] Password reset code for ${email}: ${resetCode}`);
    return {
      test: true,
      code: resetCode
    };
  }

  // Check if resend client is configured
  if (!resend) {
    console.error(`❌ Resend client not configured for password reset!`);
    throw new Error('Email service not configured - missing RESEND_API_KEY');
  }

  // Retry logic for connection issues
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 Retrying password reset email (attempt ${attempt}/${maxRetries})...`);
      }

      const { data, error } = await resend.emails.send({
        from: `GPS UTM <${getFromEmail()}>`,
        to: email,
        subject: '🔒 GPS UTM - Password Reset Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #2563EB; border-radius: 10px;">
            <h2 style="color: #2563EB; text-align: center;">🎓 Gerakan Pengguna Siswa UTM</h2>
            <h3 style="text-align: center; color: #333;">Password Reset Request</h3>
            <hr style="border: 1px solid #2563EB;">
            <p style="font-size: 16px;">Your password reset code is:</p>
            <div style="background: #eef2ff; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="color: #2563EB; letter-spacing: 10px; font-size: 36px; margin: 0;">${resetCode}</h1>
            </div>
            <p style="color: #d97706; font-weight: bold;">⏰ This code expires in 15 minutes.</p>
            <p style="color: #666;">If you did not request this, you can safely ignore this email.</p>
            <hr style="border: 1px solid #e5e7eb; margin-top: 30px;">
            <p style="text-align: center; color: #999; font-size: 12px;">
              © 2025 Gerakan Pengguna Siswa UTM<br>
              Empowering students to become smart, ethical, and responsible consumers
            </p>
          </div>
        `
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Password reset email sent to ${email}`);
      return { test: false };
    } catch (error) {
      lastError = error;
      console.error(`❌ Password reset email failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Retry on network errors
      if (attempt < maxRetries && (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ECONN'))) {
        const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a retryable error or max retries reached, break
      break;
    }
  }
  
  // All retries failed
  throw lastError || new Error('Password reset email failed after multiple attempts');
};

// ============================================
// 📌 SEND WELCOME EMAIL (Also respects test mode)
// ============================================
const sendWelcomeEmail = async (email, name) => {
  if (isTestMode) {
    console.log(`🔧 [TEST MODE] Welcome email skipped for ${email}`);
    return { test: true };
  }

  // Check if resend client is configured
  if (!resend) {
    console.error(`❌ Resend client not configured for welcome email!`);
    throw new Error('Email service not configured - missing RESEND_API_KEY');
  }

  // Retry logic for connection issues
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 Retrying welcome email (attempt ${attempt}/${maxRetries})...`);
      }

      const { data, error } = await resend.emails.send({
        from: `GPS UTM <${getFromEmail()}>`,
        to: email,
        subject: '🎉 Welcome to GPS UTM - Gerakan Pengguna Siswa!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #10b981; border-radius: 10px;">
            <h2 style="color: #059669; text-align: center;">🎓 Gerakan Pengguna Siswa UTM</h2>
            <h3 style="text-align: center; color: #333;">Student Consumer Movement</h3>
            <hr style="border: 1px solid #10b981;">
            <h2 style="color: #333;">Welcome, ${name}!</h2>
            <p style="font-size: 16px;">Thank you for joining GPS UTM! Your account has been created successfully.</p>
            <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #d97706; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">⏳ <strong>Account Status:</strong> Pending Approval</p>
            </div>
            <p>Your account is currently under review by our administrators. You will receive an email notification once your account is approved.</p>
            <h3 style="color: #059669;">What's Next?</h3>
            <ul style="line-height: 1.8;">
              <li>Wait for admin approval (usually 1-2 business days)</li>
              <li>Once approved, you can join our consumer education programs</li>
              <li>Learn about consumer rights and responsibilities</li>
              <li>Participate in workshops and activities</li>
            </ul>
            <hr style="border: 1px solid #e5e7eb; margin-top: 30px;">
            <p style="text-align: center; color: #666;">
              Best regards,<br>
              <strong>GPS UTM Team</strong>
            </p>
            <p style="text-align: center; color: #999; font-size: 12px;">
              © 2025 Gerakan Pengguna Siswa UTM<br>
              Empowering students to become smart, ethical, and responsible consumers
            </p>
          </div>
        `
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Welcome email sent to ${email}`);
      return { test: false };
    } catch (error) {
      lastError = error;
      console.error(`❌ Welcome email failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Retry on network errors
      if (attempt < maxRetries && (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ECONN'))) {
        const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a retryable error or max retries reached, break
      break;
    }
  }
  
  // All retries failed - return error but don't throw (allow registration to continue)
  console.error(`❌ Welcome email failed after ${maxRetries} attempts for ${email}`);
  console.error(`   Last error: ${lastError?.message || 'Unknown error'}`);
  return { test: true, reason: `Email failed: ${lastError?.message || 'Unknown error'}` };
};

// ============================================
// 📌 SEND NOTIFICATION EMAIL (Supports Test Mode)
// ============================================
const sendNotificationEmail = async (email, name, notificationTitle, notificationMessage, notificationType = 'general') => {
  // TEST MODE: do not send email
  if (isTestMode) {
    console.log(`🔧 [TEST MODE] Notification email skipped for ${email}: ${notificationTitle}`);
    return { test: true };
  }

  // Check if resend client is configured
  if (!resend) {
    console.warn(`⚠️ Resend client not configured for notification email to ${email}`);
    return { test: true, reason: 'Email service not configured' };
  }

  // Retry logic for connection issues
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Determine icon and color based on notification type
      let icon = '📢';
      let color = '#2563EB';
      let borderColor = '#2563EB';
      
      if (notificationType === 'event' || notificationType === 'upcoming_event') {
        icon = '📅';
        color = '#10b981';
        borderColor = '#10b981';
      } else if (notificationType === 'approval') {
        icon = '✅';
        color = '#059669';
        borderColor = '#059669';
      } else if (notificationType === 'system') {
        icon = '🔔';
        color = '#d97706';
        borderColor = '#d97706';
      }

      if (attempt > 1) {
        console.log(`🔄 Retrying notification email (attempt ${attempt}/${maxRetries})...`);
      }

      const { data, error } = await resend.emails.send({
        from: `GPS UTM <${getFromEmail()}>`,
        to: email,
        subject: `${icon} GPS UTM - ${notificationTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid ${borderColor}; border-radius: 10px;">
            <h2 style="color: ${color}; text-align: center;">🎓 Gerakan Pengguna Siswa UTM</h2>
            <h3 style="text-align: center; color: #333;">Student Consumer Movement</h3>
            <hr style="border: 1px solid ${borderColor};">
            <h2 style="color: #333;">${icon} ${notificationTitle}</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">${notificationMessage}</p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #666; font-size: 14px;">
                💡 <strong>Tip:</strong> You can view all your notifications in your dashboard.
              </p>
            </div>
            <hr style="border: 1px solid #e5e7eb; margin-top: 30px;">
            <p style="text-align: center; color: #999; font-size: 12px;">
              © 2025 Gerakan Pengguna Siswa UTM<br>
              Empowering students to become smart, ethical, and responsible consumers
            </p>
          </div>
        `
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Notification email sent to ${email}: ${notificationTitle}`);
      return { test: false };
    } catch (error) {
      lastError = error;
      console.error(`❌ Notification email failed (attempt ${attempt}/${maxRetries}) for ${email}:`, error.message);
      
      // Retry on network errors
      if (attempt < maxRetries && (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ECONN'))) {
        const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a retryable error or max retries reached, break
      break;
    }
  }
  
  // All retries failed - log but don't throw (notifications should still be saved in DB)
  console.error(`❌ Notification email failed after ${maxRetries} attempts for ${email}`);
  console.error(`   Last error: ${lastError?.message || 'Unknown error'}`);
  return { test: true, reason: `Email failed: ${lastError?.message || 'Unknown error'}` };
};

// ============================================
// 📌 GET EMAIL CONFIGURATION STATUS
// ============================================
const getEmailConfigStatus = () => {
  return {
    isTestMode,
    isConfigured: !!resend,
    hasConfig: !!process.env.RESEND_API_KEY,
    fromEmail: getFromEmail(),
    emailConfigValid
  };
};

module.exports = {
  sendTACEmail,
  sendResetEmail,
  sendWelcomeEmail,
  sendNotificationEmail,
  getEmailConfigStatus
};
