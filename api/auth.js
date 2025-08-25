// 檔案路徑: /api/auth.js
// 此檔案整合所有身份驗證功能
// 檔案路徑: /api/auth.js
// 從 Supabase、Resend 和各種加密/權杖函式庫中匯入必要的工具
// 檔案路徑: /api/auth.js

// 從 Supabase、Resend 和各種加密/權杖函式庫中匯入必要的工具
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

// 讀取 Vercel 環境變數並初始化所有服務
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const resendApiKey = process.env.RESEND_API_KEY;
const resend = new Resend(resendApiKey);

const JWT_SECRET = process.env.JWT_SECRET;

// --- 各個功能的獨立處理函式 ---

/**
 * 處理使用者註冊
 * @param {object} data - 包含 username, password, email, serial 的物件
 */
async function handleRegister(data) {
  const { username, password, email, serial } = data;
  if (!username || !password || !email || !serial) {
    throw new Error('所有欄位皆為必填。');
  }

  const { data: serialData, error: serialError } = await supabase.from('serials').select('id, total_limit, used_count').eq('serial_code', serial).single();
  if (serialError || !serialData) {
    throw new Error('註冊碼無效或不存在。');
  }
  if (serialData.used_count >= serialData.total_limit) {
    throw new Error('此註冊碼已達使用上限。');
  }

  const { data: existingUsers, error: checkUserError } = await supabase.from('users').select('account, email').or(`account.eq.${username},email.eq.${email}`);
  if (checkUserError) {
    throw checkUserError;
  }
  if (existingUsers && existingUsers.length > 0) {
    if (existingUsers.some(u => u.account === username)) {
      throw new Error('此帳號已被註冊。');
    }
    if (existingUsers.some(u => u.email === email)) {
      throw new Error('此信箱已被註冊。');
    }
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);

  const { error: insertError } = await supabase.from('users').insert([{ account: username, password: hashedPassword, email: email, verify_code: verifyCode, verify_expires: expiresAt, is_verified: false }]);
  if (insertError) {
    throw insertError;
  }

  const { error: updateSerialError } = await supabase.from('serials').update({ used_count: serialData.used_count + 1 }).eq('id', serialData.id);
  if (updateSerialError) {
    console.error('更新註冊碼次數失敗:', updateSerialError);
  }

  await resend.emails.send({
    from: 'Barcode App <onboarding@resend.dev>',
    to: [email],
    subject: '您的條碼產生器驗證碼',
    html: `<p>您的驗證碼是：<strong>${verifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>`,
  });

  return { result: 'success_pending_verification' };
}

/**
 * 處理使用者登入
 * @param {object} data - 包含 account, password 的物件
 */
async function handleLogin(data) {
    const { account, password } = data;
    if (!account || !password) {
      throw new Error('帳號和密碼不能為空。');
    }

    const { data: userData, error: userError } = await supabase.from('users').select('*').eq('account', account).single();
    if (userError || !userData) {
      throw new Error('帳號或密碼錯誤。');
    }

    const isPasswordMatch = await bcrypt.compare(password, userData.password);
    if (!isPasswordMatch) {
      throw new Error('帳號或密碼錯誤。');
    }

    if (userData.is_verified !== true) {
        const err = new Error('此帳號尚未完成信箱驗證。');
        err.reason = 'unverified';
        throw err;
    }
    
    await supabase.from('users').update({ last_login: new Date().toISOString(), login_count: (userData.login_count || 0) + 1 }).eq('id', userData.id);
    
    const tokenPayload = { userId: userData.id, account: userData.account, role: userData.is_admin ? 'admin' : 'user' };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });
    
    const userProfile = { 
      account: userData.account, 
      email: userData.email, 
      current_quota: userData.current_quota, 
      isAdmin: userData.is_admin === true, 
      register_date: userData.register_date, 
      last_modified: userData.last_modified 
    };
    
    return { success: true, profile: userProfile, token: token };
}

/**
 * 處理信箱驗證碼
 * @param {object} data - 包含 account, code 的物件
 */
async function handleVerifyCode(data) {
    const { account, code } = data;
    if (!account || !code) {
      throw new Error('缺少帳號或驗證碼。');
    }

    const { data: userData, error: fetchError } = await supabase.from('users').select('verify_code, verify_expires, is_verified').eq('account', account).single();
    if (fetchError || !userData) {
      throw new Error('找不到該帳號的註冊資料。');
    }
    
    if (userData.is_verified) {
      return { success: true, message: '此帳號已經驗證過了。' };
    }
    if (userData.verify_code !== code) {
      throw new Error('驗證碼錯誤。');
    }
    if (new Date() > new Date(userData.verify_expires)) {
      throw new Error('驗證碼已過期，請點擊重新寄送。');
    }

    const { error: updateError } = await supabase.from('users').update({ is_verified: true, current_quota: 20, verify_code: null, verify_expires: null }).eq('account', account);
    if (updateError) {
      throw updateError;
    }
    
    return { success: true };
}

/**
 * 處理重新寄送驗證碼
 * @param {object} data - 包含 account 的物件
 */
async function handleResendCode(data) {
    const { account } = data;
    if (!account) {
      throw new Error('缺少帳號參數。');
    }
    
    const { data: userData, error: fetchError } = await supabase.from('users').select('email, is_verified').eq('account', account).single();
    if (fetchError || !userData) {
      throw new Error('找不到此帳號。');
    }
    if (userData.is_verified) {
      throw new Error('此帳號已驗證，無需重複操作。');
    }

    const newVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);

    const { error: updateError } = await supabase.from('users').update({ verify_code: newVerifyCode, verify_expires: newExpiresAt }).eq('account', account);
    if (updateError) {
      throw updateError;
    }
    
    await resend.emails.send({
        from: 'Barcode App <onboarding@resend.dev>',
        to: [userData.email],
        subject: '您的新條碼產生器驗證碼',
        html: `<p>您的【新】驗證碼是：<strong>${newVerifyCode}</strong></p><p>此驗證碼將在 10 分鐘後失效。</p>`,
    });

    return { success: true, message: '新的驗證碼已寄送到您的信箱。' };
}

/**
 * 處理忘記密碼請求 (寄送重設郵件)
 * @param {object} data - 包含 email 的物件
 * @param {object} requestHeaders - 來自 Vercel request 的 headers 物件
 */
async function handleForgotPassword(data, requestHeaders) {
    const { email } = data;
    if (!email) throw new Error('電子信箱不能為空。');

    const { data: userData, error } = await supabase.from('users').select('id, account, is_verified').eq('email', email).single();

    if (error || !userData || !userData.is_verified) {
      console.log(`密碼重設請求，但找不到已驗證的信箱: ${email}`);
    } else {
        const resetToken = randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(new Date().getTime() + 30 * 60 * 1000);

        await supabase.from('users').update({ reset_token: resetToken, reset_token_expires: resetTokenExpires }).eq('id', userData.id);

        const resetUrl = `https://${requestHeaders.host}/reset-password.html?token=${resetToken}`;

        await resend.emails.send({
            from: 'Barcode App <onboarding@resend.dev>',
            to: [email],
            subject: '您的條碼產生器密碼重設請求',
            html: `<p>您好 ${userData.account},</p><p>請點擊下方的連結來設定您的新密碼：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>此連結將在 30 分鐘後失效。</p>`,
        });
    }
    return { message: '如果您的信箱存在於我們的系統中且已通過驗證，您將會收到一封密碼重設郵件。' };
}

/**
 * 處理重設密碼
 * @param {object} data - 包含 token, newPassword 的物件
 */
async function handleResetPassword(data) {
    const { token, newPassword } = data;
    if (!token || !newPassword) throw new Error('缺少 Token 或新密碼。');
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) throw new Error('新密碼格式不符合要求。');

    const { data: userData, error: fetchError } = await supabase.from('users').select('id, reset_token_expires').eq('reset_token', token).gt('reset_token_expires', new Date().toISOString()).single();
    if (fetchError || !userData) throw new Error('密碼重設連結無效或已過期，請重新申請。');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const { error: updateError } = await supabase.from('users').update({ password: hashedPassword, reset_token: null, reset_token_expires: null }).eq('id', userData.id);
    if (updateError) throw updateError;
    
    return { success: true, message: '密碼已成功重設，現在您可以使用新密碼登入了。' };
}

/**
 * 處理更新個人資料
 * @param {object} data - 包含 currentPassword, newPassword, newEmail 的物件
 * @param {object} headers - 來自 Vercel request 的 headers 物件
 */
async function handleUpdateProfile(data, headers) {
    const token = headers.authorization?.split(' ')[1];
    if (!token) throw new Error('未提供授權 Token。');
    const decodedUser = jwt.verify(token, JWT_SECRET);
    const userId = decodedUser.userId;

    const { currentPassword, newPassword, newEmail } = data;
    if (!currentPassword) throw new Error('為了安全，請務必輸入您目前的密碼。');
    
    const { data: userData, error: fetchError } = await supabase.from('users').select('password, email').eq('id', userId).single();
    if (fetchError) throw fetchError;

    const isPasswordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!isPasswordMatch) throw new Error('目前的密碼不正確。');

    const dataToUpdate = { last_modified: new Date().toISOString() };
    let responseMessage = '個人資料更新成功！';
    let emailChanged = false;
    
    if (newPassword) {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
        if (!passwordRegex.test(newPassword)) throw new Error('新密碼格式不符合要求。');
        dataToUpdate.password = await bcrypt.hash(newPassword, 10);
        responseMessage = '密碼已成功更新！';
    }

    if (newEmail && newEmail !== userData.email) {
        const { data: existingEmail, error: emailCheckError } = await supabase.from('users').select('id').eq('email', newEmail).eq('is_verified', true).single();
        if (emailCheckError && emailCheckError.code !== 'PGRST116') throw emailCheckError;
        if (existingEmail) throw new Error('此信箱已被其他帳號使用。');

        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(new Date().getTime() + 10 * 60 * 1000);
        
        dataToUpdate.email = newEmail;
        dataToUpdate.is_verified = false;
        dataToUpdate.verify_code = verifyCode;
        dataToUpdate.verify_expires = expiresAt;
        emailChanged = true;

        await resend.emails.send({
            from: 'Barcode App <onboarding@resend.dev>',
            to: [newEmail],
            subject: '請驗證您的新電子信箱',
            html: `<p>您的新驗證碼是：<strong>${verifyCode}</strong></p>`,
        });
        responseMessage = '資料已更新，新的驗證信已寄出，請前往信箱完成驗證。';
    }
    
    const { error: updateError } = await supabase.from('users').update(dataToUpdate).eq('id', userId);
    if (updateError) throw updateError;
    
    return { success: true, message: responseMessage, passwordChanged: !!newPassword, emailChanged: emailChanged };
}


// --- 主處理函式 (路由器) ---
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }
  
  const { action, ...data } = request.body;

  try {
    let result;
    // 根據 'action' 參數，決定要執行哪個函式
    switch (action) {
      case 'register':
        result = await handleRegister(data);
        break;
      case 'login':
        result = await handleLogin(data);
        break;
      case 'verifyCode':
        result = await handleVerifyCode(data);
        break;
      case 'resendCode':
        result = await handleResendCode(data);
        break;
      case 'forgotPassword':
        result = await handleForgotPassword(data, request.headers);
        break;
      case 'resetPassword':
        result = await handleResetPassword(data);
        break;
      case 'updateProfile':
        result = await handleUpdateProfile(data, request.headers);
        break;
      default:
        return response.status(400).json({ message: '無效的操作 (action)。' });
    }
    return response.status(200).json(result);
  } catch (error) {
    console.error(`驗證 API 錯誤 (action: ${action}):`, error);
    if (error.reason) {
        return response.status(403).json({ success: false, reason: error.reason, message: error.message });
    }
    return response.status(500).json({ message: error.message });
  }
}